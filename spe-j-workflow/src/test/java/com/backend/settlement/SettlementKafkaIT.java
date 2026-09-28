package com.backend.settlement;

import com.backend.settlement.consumer.SettlementCommandParser;
import com.backend.settlement.consumer.SettlementConsumer;
import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.model.ProcessingOutcome;
import com.backend.settlement.model.SettlementQuarantineEntry;
import com.backend.settlement.service.ISettlementQuarantineService;
import com.backend.settlement.service.ISettlementService;
import com.backend.settlement.service.impl.SettlementMetrics;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.AcknowledgingMessageListener;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.KafkaMessageListenerContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@Testcontainers
class SettlementKafkaIT {
    @Container static final KafkaContainer KAFKA=new KafkaContainer("apache/kafka:4.2.1");
    @Test void retriesUnfinishedRecordBeforeAcknowledgingNextOffset() throws Exception {
        String topic="credit-receivable",group="worker-it-"+UUID.randomUUID();
        var mapper=JsonMapper.builder().build();
        var first=new SettlementCommand(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"first");
        var second=new SettlementCommand(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"second");
        var seen=new CopyOnWriteArrayList<UUID>();var attempts=new AtomicInteger();var completed=new CountDownLatch(1);
        ISettlementService service=command -> {
            seen.add(command.receivableUuid());
            if(command.equals(first) && attempts.getAndIncrement()==0) return ProcessingOutcome.retry(Duration.ofMillis(100));
            if(command.equals(second)) completed.countDown();
            return ProcessingOutcome.complete();
        };
        var listener=new SettlementConsumer(new SettlementCommandParser(mapper),service,
                mock(ISettlementQuarantineService.class),mock(SettlementMetrics.class));
        try(var admin=Admin.create(Map.of("bootstrap.servers",KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic(topic,1,(short)1))).all().get(10,TimeUnit.SECONDS);
            var consumerFactory=new DefaultKafkaConsumerFactory<byte[],byte[]>(Map.of("bootstrap.servers",KAFKA.getBootstrapServers(),
                    "group.id",group,"enable.auto.commit",false,"auto.offset.reset","earliest","max.poll.records",1),new ByteArrayDeserializer(),new ByteArrayDeserializer());
            var properties=new ContainerProperties(topic);
            properties.setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);properties.setPollTimeout(100);
            properties.setMessageListener((AcknowledgingMessageListener<byte[],byte[]>)listener::receive);
            var container=new KafkaMessageListenerContainer<>(consumerFactory,properties);
            var producerFactory=new DefaultKafkaProducerFactory<byte[],byte[]>(Map.of("bootstrap.servers",KAFKA.getBootstrapServers(),
                    "enable.idempotence",true,"acks","all"),new ByteArraySerializer(),new ByteArraySerializer());
            try {
                container.start();
                var producer=new KafkaTemplate<byte[],byte[]>(producerFactory);
                producer.send(new ProducerRecord<>(topic,0,utf8(first.receivableUuid().toString()),utf8(mapper.writeValueAsString(first)))).get(10,TimeUnit.SECONDS);
                producer.send(new ProducerRecord<>(topic,0,utf8(second.receivableUuid().toString()),utf8(mapper.writeValueAsString(second)))).get(10,TimeUnit.SECONDS);
                assertTrue(completed.await(20,TimeUnit.SECONDS));
                assertEquals(List.of(first.receivableUuid(),first.receivableUuid(),second.receivableUuid()),seen);
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
                boolean committed=false;
                while(System.nanoTime()<deadline) {
                    var offset=admin.listConsumerGroupOffsets(group).partitionsToOffsetAndMetadata().get().get(new TopicPartition(topic,0));
                    if(offset!=null && offset.offset()==2) { committed=true; break; }
                    Thread.sleep(50);
                }
                assertTrue(committed,"Somente os resultados tratados devem avançar os offsets.");
            } finally { container.stop();producerFactory.destroy(); }
        }
    }

    @Test void quarantinesPoisonRecordBeforeAdvancingPartitionToNextCommand() throws Exception {
        String topic="credit-receivable-poison-"+UUID.randomUUID(),group="worker-poison-it-"+UUID.randomUUID();
        var mapper=JsonMapper.builder().build();
        var command=new SettlementCommand(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"valid");
        var quarantineStarted=new CountDownLatch(1);var releaseQuarantine=new CountDownLatch(1);
        var quarantined=new CopyOnWriteArrayList<SettlementQuarantineEntry>();
        var processed=new CopyOnWriteArrayList<UUID>();var completed=new CountDownLatch(1);
        ISettlementQuarantineService quarantine=entry -> {
            quarantineStarted.countDown();
            try {
                if(!releaseQuarantine.await(30,TimeUnit.SECONDS)) throw new IllegalStateException("Timeout de fixture.");
            } catch(InterruptedException error) {
                Thread.currentThread().interrupt();throw new IllegalStateException("Fixture interrompida.",error);
            }
            quarantined.add(entry);
        };
        ISettlementService service=received -> { processed.add(received.receivableUuid());completed.countDown();return ProcessingOutcome.complete(); };
        var listener=new SettlementConsumer(new SettlementCommandParser(mapper),service,quarantine,mock(SettlementMetrics.class));
        try(var admin=Admin.create(Map.of("bootstrap.servers",KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic(topic,1,(short)1))).all().get(10,TimeUnit.SECONDS);
            var consumerFactory=new DefaultKafkaConsumerFactory<byte[],byte[]>(Map.of("bootstrap.servers",KAFKA.getBootstrapServers(),
                    "group.id",group,"enable.auto.commit",false,"auto.offset.reset","earliest","max.poll.records",1),new ByteArrayDeserializer(),new ByteArrayDeserializer());
            var properties=new ContainerProperties(topic);
            properties.setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);properties.setPollTimeout(100);
            properties.setMessageListener((AcknowledgingMessageListener<byte[],byte[]>)listener::receive);
            var container=new KafkaMessageListenerContainer<>(consumerFactory,properties);
            var producerFactory=new DefaultKafkaProducerFactory<byte[],byte[]>(Map.of("bootstrap.servers",KAFKA.getBootstrapServers(),
                    "enable.idempotence",true,"acks","all"),new ByteArraySerializer(),new ByteArraySerializer());
            try {
                container.start();
                var producer=new KafkaTemplate<byte[],byte[]>(producerFactory);
                producer.send(new ProducerRecord<>(topic,0,utf8("bad-key"),new byte[]{'{',(byte)0xC3,0x28})).get(10,TimeUnit.SECONDS);
                producer.send(new ProducerRecord<>(topic,0,utf8(command.receivableUuid().toString()),utf8(mapper.writeValueAsString(command))))
                        .get(10,TimeUnit.SECONDS);
                assertTrue(quarantineStarted.await(10,TimeUnit.SECONDS));
                assertTrue(processed.isEmpty(),"O próximo comando não pode passar pela persistência da quarentena.");
                var before=admin.listConsumerGroupOffsets(group).partitionsToOffsetAndMetadata().get().get(new TopicPartition(topic,0));
                assertTrue(before==null || before.offset()==0,"O offset não pode ser confirmado antes do commit da quarentena.");
                releaseQuarantine.countDown();
                assertTrue(completed.await(20,TimeUnit.SECONDS));
                assertEquals(List.of(command.receivableUuid()),processed);
                assertEquals(1,quarantined.size());
                assertEquals(0,quarantined.getFirst().sourcePartition());
                assertEquals(0,quarantined.getFirst().sourceOffset());
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
                boolean committed=false;
                while(System.nanoTime()<deadline) {
                    var offset=admin.listConsumerGroupOffsets(group).partitionsToOffsetAndMetadata().get().get(new TopicPartition(topic,0));
                    if(offset!=null && offset.offset()==2) { committed=true; break; }
                    Thread.sleep(50);
                }
                assertTrue(committed,"O offset só avança após persistir a quarentena e tratar o próximo registro.");
            } finally {
                releaseQuarantine.countDown();container.stop();producerFactory.destroy();
            }
        }
    }

    private static byte[] utf8(String value) { return value.getBytes(StandardCharsets.UTF_8); }
}
