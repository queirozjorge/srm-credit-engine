package com.backend.outbox;

import com.backend.outbox.model.OutboxClaim;
import com.backend.outbox.repository.OutboxRepository;
import com.backend.outbox.service.impl.OutboxRelayImpl;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@Testcontainers
class OutboxKafkaIT {
    @Container
    static final KafkaContainer KAFKA=new KafkaContainer("apache/kafka:4.2.1");

    @Test
    void publishesExactCommandToRealBrokerWithReceivableKeyAndAcknowledges() throws Exception {
        try(var admin=Admin.create(Map.of("bootstrap.servers",KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic("credit-receivable",3,(short)1),new NewTopic("credit-receivable.dlq",3,(short)1))).all().get();
        }
        var factory=new DefaultKafkaProducerFactory<String,String>(Map.of(
            ProducerConfig.BOOTSTRAP_SERVERS_CONFIG,KAFKA.getBootstrapServers(),
            ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG,StringSerializer.class,
            ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG,StringSerializer.class,
            ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG,true,ProducerConfig.ACKS_CONFIG,"all",
            ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION,5));
        UUID batch=UUID.randomUUID(),receivable=UUID.randomUUID(),request=UUID.randomUUID();
        String payload="{\"batchUuid\":\""+batch+"\",\"receivableUuid\":\""+receivable+"\",\"requestUuid\":\""+request+"\",\"idempotencyKey\":\"key\"}";
        var claim=new OutboxClaim(UUID.randomUUID(),batch,receivable,request,UUID.randomUUID(),"credit-receivable",payload,UUID.randomUUID(),1);
        var now=Instant.now();
        var repository=mock(OutboxRepository.class);
        when(repository.claim(now,now.plusSeconds(60))).thenReturn(Optional.of(claim));
        new OutboxRelayImpl(repository,new KafkaTemplate<>(factory),Clock.fixed(now,ZoneOffset.UTC),mock(com.backend.outbox.service.impl.OutboxMetrics.class),60,5).publishNext();
        verify(repository).sent(claim,now);
        try(var consumer=new KafkaConsumer<String,String>(Map.of("bootstrap.servers",KAFKA.getBootstrapServers(),
            "group.id",UUID.randomUUID().toString(),"auto.offset.reset","earliest","enable.auto.commit",false),
            new StringDeserializer(),new StringDeserializer())) {
            consumer.subscribe(List.of("credit-receivable"));
            var records=consumer.poll(Duration.ofSeconds(15));
            assertEquals(1,records.count());
            var record=records.iterator().next();
            assertEquals(receivable.toString(),record.key()); assertEquals(payload,record.value());
        } finally { factory.destroy(); }
    }
}
