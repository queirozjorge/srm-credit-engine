package com.backend.outbox.service.impl;

import com.backend.outbox.model.OutboxClaim;
import com.backend.outbox.repository.OutboxRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OutboxRelayTest {
    final Instant now=Instant.parse("2026-09-27T12:00:00Z");
    final OutboxRepository repository=mock(OutboxRepository.class);
    @SuppressWarnings("unchecked")
    final KafkaTemplate<String,String> producer=mock(KafkaTemplate.class);
    final OutboxRelayImpl relay=new OutboxRelayImpl(repository,producer,Clock.fixed(now,ZoneOffset.UTC),mock(OutboxMetrics.class),60,5,4,1000);
    final OutboxClaim claim=new OutboxClaim(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"credit-receivable","{}",UUID.randomUUID(),1);

    @AfterEach void stopPublishers() { relay.stop(); }

    @Test void confirmsDatabaseOnlyAfterBrokerAcknowledges() {
        when(repository.claim(now,now.plusSeconds(60))).thenReturn(Optional.of(claim));
        when(producer.send(claim.topic(),claim.receivableUuid().toString(),claim.payload())).thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));
        relay.publishNext();
        var order=inOrder(repository,producer);
        order.verify(repository).claim(now,now.plusSeconds(60));
        order.verify(producer).send(claim.topic(),claim.receivableUuid().toString(),claim.payload());
        order.verify(repository).sent(claim,now);
        verify(repository,never()).retry(any(),any(),any());
    }

    @Test void failedPublicationSchedulesRetryWithoutMarkingSent() {
        when(repository.claim(now,now.plusSeconds(60))).thenReturn(Optional.of(claim));
        when(producer.send(anyString(),anyString(),anyString())).thenReturn(CompletableFuture.failedFuture(new IllegalStateException("broker unavailable")));
        relay.publishNext();
        verify(repository).retry(claim,now,now.plusSeconds(5));
        verify(repository,never()).sent(any(),any());
    }

    @Test void publicationHasBoundedConcurrencyAndWaitsForEachBrokerConfirmation() throws Exception {
        var futures = new CopyOnWriteArrayList<CompletableFuture<SendResult<String, String>>>();
        var claimed = new AtomicInteger();
        var inFlight = new AtomicInteger();
        var maximum = new AtomicInteger();
        when(repository.claim(any(), any())).thenAnswer(invocation ->
            claimed.getAndIncrement() < 12 ? Optional.of(claim) : Optional.empty());
        when(producer.send(anyString(), anyString(), anyString())).thenAnswer(invocation -> {
            maximum.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
            var future = new CompletableFuture<SendResult<String, String>>();
            futures.add(future);
            return future;
        });
        when(repository.sent(any(), any())).thenAnswer(invocation -> {
            inFlight.decrementAndGet();
            return true;
        });
        try (var caller = Executors.newSingleThreadExecutor()) {
            var cycle = caller.submit(relay::publishAvailable);
            try {
                for (int wave = 1; wave <= 3; wave++) {
                    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                    while (futures.size() < wave * 4 && System.nanoTime() < deadline) Thread.sleep(5);
                    assertEquals(wave * 4, futures.size());
                    verify(repository, times((wave - 1) * 4)).sent(any(), any());
                    for (int i = (wave - 1) * 4; i < wave * 4; i++) futures.get(i).complete(null);
                }
                cycle.get(5, TimeUnit.SECONDS);
            } finally {
                futures.forEach(future -> future.complete(null));
                cycle.cancel(true);
            }
        }
        assertEquals(4, maximum.get());
        assertEquals(0, inFlight.get());
        verify(repository, times(12)).sent(claim, now);
        verify(repository, never()).retry(any(), any(), any());
    }

    @Test void limitsClaimsPerCycleAndStopsDispatchAfterShutdown() {
        var bounded = new OutboxRelayImpl(repository, producer, Clock.fixed(now, ZoneOffset.UTC),
            mock(OutboxMetrics.class), 60, 5, 2, 6);
        when(repository.claim(any(), any())).thenReturn(Optional.of(claim));
        when(producer.send(anyString(), anyString(), anyString()))
            .thenReturn(CompletableFuture.completedFuture(null));
        try { bounded.publishAvailable(); } finally { bounded.stop(); }
        bounded.publishAvailable();
        verify(repository, times(6)).claim(any(), any());
        verify(repository, times(6)).sent(claim, now);
    }
}
