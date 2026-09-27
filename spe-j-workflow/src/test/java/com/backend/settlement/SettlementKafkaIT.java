package com.backend.settlement;

import com.backend.settlement.consumer.SettlementCommandParser;
import com.backend.settlement.consumer.SettlementConsumer;
import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.model.ProcessingOutcome;
import com.backend.settlement.service.ISettlementService;
import com.backend.settlement.service.impl.SettlementMetrics;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
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
        var listener=new SettlementConsumer(new SettlementCommandParser(mapper),service,mock(SettlementMetrics.class));
        try(var admin=Admin.create(Map.of("bootstrap.servers",KAFKA.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic(topic,1,(short)1))).all().get(10,TimeUnit.SECONDS);
            var consumerFactory=new DefaultKafkaConsumerFactory<String,String>(Map.of("bootstrap.servers",KAFKA.getBootstrapServers(),
                    "group.id",group,"enable.auto.commit",false,"auto.offset.reset","earliest","max.poll.records",1),new StringDeserializer(),new StringDeserializer());
            var properties=new ContainerProperties(topic);
            properties.setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);properties.setPollTimeout(100);
            properties.setMessageListener((AcknowledgingMessageListener<String,String>)listener::receive);
            var container=new KafkaMessageListenerContainer<>(consumerFactory,properties);
            var producerFactory=new DefaultKafkaProducerFactory<String,String>(Map.of("bootstrap.servers",KAFKA.getBootstrapServers(),
                    "enable.idempotence",true,"acks","all"),new StringSerializer(),new StringSerializer());
            try {
                container.start();
                var producer=new KafkaTemplate<>(producerFactory);
                producer.send(new ProducerRecord<>(topic,0,first.receivableUuid().toString(),mapper.writeValueAsString(first))).get(10,TimeUnit.SECONDS);
                producer.send(new ProducerRecord<>(topic,0,second.receivableUuid().toString(),mapper.writeValueAsString(second))).get(10,TimeUnit.SECONDS);
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
}
