package com.backend.outbox.service.impl;

import com.backend.outbox.model.OutboxClaim;
import com.backend.outbox.repository.OutboxRepository;
import com.backend.outbox.service.IOutboxRelay;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

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
    private final int concurrency;
    private final int batchSize;
    private final ExecutorService publishers;

    public OutboxRelayImpl(OutboxRepository repository, KafkaTemplate<String, String> producer, Clock clock, OutboxMetrics metrics,
                           @Value("${engine.outbox.claim-seconds:60}") long claimSeconds,
                           @Value("${engine.outbox.retry-seconds:5}") long retrySeconds,
                           @Value("${engine.outbox.concurrency:4}") int concurrency,
                           @Value("${engine.outbox.batch-size:1000}") int batchSize) {
        if (claimSeconds <= 35 || retrySeconds < 1) throw new IllegalArgumentException("Prazos da outbox inválidos.");
        if (concurrency < 1 || concurrency > 32 || batchSize < concurrency || batchSize > 10000)
            throw new IllegalArgumentException("Limites de publicação da outbox inválidos.");
        this.repository=repository;
        this.producer=producer;
        this.clock=clock;
        this.metrics=metrics;
        this.claimSeconds=claimSeconds;
        this.retrySeconds=retrySeconds;
        this.concurrency=concurrency;
        this.batchSize=batchSize;
        publishers=Executors.newFixedThreadPool(concurrency, Thread.ofPlatform().name("outbox-publisher-", 0).factory());
    }

    @Scheduled(fixedDelayString="${engine.outbox.delay-ms:100}")
    public void publishAvailable() {
        if (publishers.isShutdown()) return;
        var remaining = new AtomicInteger(batchSize);
        var tasks = new ArrayList<Callable<Void>>();
        for (int lane = 0; lane < concurrency; lane++) {
            tasks.add(() -> {
                while (!publishers.isShutdown() && !Thread.currentThread().isInterrupted()
                        && remaining.getAndDecrement() > 0 && publishOne()) {
                    // Each lane claims only its next message; there is no unbounded in-flight queue.
                }
                return null;
            });
        }
        try {
            for (var result : publishers.invokeAll(tasks)) result.get();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException failure) {
            failed(null, failure);
        } catch (RejectedExecutionException stopped) {
            if (!publishers.isShutdown()) throw stopped;
        }
    }

    @PreDestroy
    public void stop() {
        publishers.shutdown();
        try {
            if (!publishers.awaitTermination(40, TimeUnit.SECONDS)) publishers.shutdownNow();
        } catch (InterruptedException interrupted) {
            publishers.shutdownNow();
            Thread.currentThread().interrupt();
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
