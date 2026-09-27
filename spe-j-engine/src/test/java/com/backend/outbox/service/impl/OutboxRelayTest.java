package com.backend.outbox.service.impl;

import com.backend.outbox.model.OutboxClaim;
import com.backend.outbox.repository.OutboxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import static org.mockito.Mockito.*;

class OutboxRelayTest {
    final Instant now=Instant.parse("2026-09-27T12:00:00Z");
    final OutboxRepository repository=mock(OutboxRepository.class);
    @SuppressWarnings("unchecked")
    final KafkaTemplate<String,String> producer=mock(KafkaTemplate.class);
    final OutboxRelayImpl relay=new OutboxRelayImpl(repository,producer,Clock.fixed(now,ZoneOffset.UTC),mock(OutboxMetrics.class),60,5);
    final OutboxClaim claim=new OutboxClaim(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"credit-receivable","{}",UUID.randomUUID(),1);

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
}
