package com.backend.settlement.consumer;

import com.backend.settlement.service.ISettlementService;
import com.backend.settlement.service.impl.SettlementMetrics;
import java.time.Duration;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.DependsOn;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
@DependsOn("schemaCompatibilityChecker")
@ConditionalOnProperty(name="workflow.consumer.enabled",havingValue="true",matchIfMissing=true)
public class SettlementConsumer {
    private static final Logger LOG=LoggerFactory.getLogger(SettlementConsumer.class);
    private final SettlementCommandParser parser;
    private final ISettlementService service;
    private final SettlementMetrics metrics;
    public SettlementConsumer(SettlementCommandParser parser,ISettlementService service,SettlementMetrics metrics) {
        this.parser=parser;this.service=service;this.metrics=metrics;
    }

    @KafkaListener(id="receivable-settlement",topics="credit-receivable",concurrency="${workflow.consumer.concurrency:3}",
            groupId="${spring.kafka.consumer.group-id}")
    public void receive(ConsumerRecord<String,String> record,Acknowledgment acknowledgment) {
        try {
            var command=parser.parse(record.key(),record.value());
            var outcome=service.process(command);
            if(outcome.acknowledged()) acknowledgment.acknowledge();
            else acknowledgment.nack(outcome.retryAfter());
        } catch(RuntimeException error) {
            metrics.outcome("unacknowledged");
            LOG.atError().addKeyValue("code","CONSUMO_NAO_CONFIRMADO").addKeyValue("operation","SETTLEMENT")
                    .addKeyValue("topic",record.topic()).addKeyValue("partition",record.partition()).addKeyValue("offset",record.offset())
                    .setCause(error).log("[handler]:[error]: CONSUMO_NAO_CONFIRMADO - Não foi possível confirmar o consumo.");
            acknowledgment.nack(Duration.ofSeconds(1));
        }
    }
}
