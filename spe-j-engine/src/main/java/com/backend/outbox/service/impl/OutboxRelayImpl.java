package com.backend.outbox.service.impl;

import com.backend.outbox.model.OutboxClaim;
import com.backend.outbox.repository.OutboxRepository;
import com.backend.outbox.service.IOutboxRelay;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

@Service
@ConditionalOnProperty(name="engine.outbox.enabled", havingValue="true", matchIfMissing=true)
public class OutboxRelayImpl implements IOutboxRelay {
    private static final Logger LOG = LoggerFactory.getLogger(OutboxRelayImpl.class);
    private final OutboxRepository repository;
    private final KafkaTemplate<String, String> producer;
    private final Clock clock;
    private final OutboxMetrics metrics;
    private final long claimSeconds;
    private final long retrySeconds;

    public OutboxRelayImpl(OutboxRepository repository, KafkaTemplate<String, String> producer, Clock clock, OutboxMetrics metrics,
                           @Value("${engine.outbox.claim-seconds:60}") long claimSeconds,
                           @Value("${engine.outbox.retry-seconds:5}") long retrySeconds) {
        if (claimSeconds <= 35 || retrySeconds < 1) throw new IllegalArgumentException("Prazos da outbox inválidos.");
        this.repository=repository;
        this.producer=producer;
        this.clock=clock;
        this.metrics=metrics;
        this.claimSeconds=claimSeconds;
        this.retrySeconds=retrySeconds;
    }

    @Scheduled(fixedDelayString="${engine.outbox.delay-ms:1000}")
    public void publishAvailable() {
        for (int count=0; count<100; count++) {
            if (!publishOne()) return;
        }
    }

    @Override
    public void publishNext() { publishOne(); }

    private boolean publishOne() {
        OutboxClaim claim = null;
        try {
            Instant now = clock.instant();
            claim = repository.claim(now, now.plusSeconds(claimSeconds)).orElse(null);
            if (claim == null) return false;
            // Broker I/O intentionally occurs after the claim transaction commits.
            long started=System.nanoTime();
            try {
                producer.send(claim.topic(), claim.receivableUuid().toString(), claim.payload()).get(35, TimeUnit.SECONDS);
            } finally {
                metrics.duration(System.nanoTime()-started);
            }
            if (repository.sent(claim, clock.instant())) metrics.published(claim.topic());
            return true;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            failed(claim, interrupted);
        } catch (Exception failure) {
            failed(claim, failure);
        }
        return false;
    }

    private void failed(OutboxClaim claim, Exception failure) {
        metrics.failed();
        LOG.atError().addKeyValue("code", "OUTBOX_PUBLICACAO_FALHOU").addKeyValue("operation", "outbox.publish")
            .addKeyValue("batchUuid", claim == null ? null : claim.batchUuid())
            .addKeyValue("receivableUuid", claim == null ? null : claim.receivableUuid())
            .addKeyValue("requestUuid", claim == null ? null : claim.requestUuid())
            .addKeyValue("attemptUuid", claim == null ? null : claim.attemptUuid())
            .setCause(failure).log("[outbox]:[error]: OUTBOX_PUBLICACAO_FALHOU - Falha na publicação do comando.");
        if (claim == null) return;
        try {
            Instant now = clock.instant();
            repository.retry(claim, now, now.plusSeconds(retrySeconds));
        } catch (Exception recoveryFailure) {
            LOG.atError().addKeyValue("code", "OUTBOX_REAGENDAMENTO_FALHOU").addKeyValue("operation", "outbox.retry")
                .addKeyValue("outboxUuid", claim.uuid()).setCause(recoveryFailure)
                .log("[outbox]:[error]: OUTBOX_REAGENDAMENTO_FALHOU - Reivindicação será recuperada após expiração.");
        }
    }
}
