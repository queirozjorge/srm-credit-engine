package com.backend.settlement.consumer;

import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.exceptions.InvalidCommandException;
import com.backend.settlement.exceptions.InvalidSettlementMessageException;
import com.backend.settlement.model.SettlementQuarantineEntry;
import com.backend.settlement.service.ISettlementQuarantineService;
import com.backend.settlement.service.ISettlementService;
import com.backend.settlement.service.impl.SettlementMetrics;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
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
    private final ISettlementQuarantineService quarantine;
    private final SettlementMetrics metrics;
    public SettlementConsumer(SettlementCommandParser parser,ISettlementService service,
            ISettlementQuarantineService quarantine,SettlementMetrics metrics) {
        this.parser=parser;this.service=service;this.quarantine=quarantine;this.metrics=metrics;
    }

    @KafkaListener(id="receivable-settlement",topics="credit-receivable",concurrency="${workflow.consumer.concurrency:3}",
            groupId="${spring.kafka.consumer.group-id}")
    public void receive(ConsumerRecord<byte[],byte[]> record,Acknowledgment acknowledgment) {
        var command = parse(record, acknowledgment);
        if (command == null) return;
        try {
            var outcome=service.process(command);
            if(outcome.acknowledged()) acknowledgment.acknowledge();
            else acknowledgment.nack(outcome.retryAfter());
        } catch(InvalidCommandException error) {
            quarantine(record, "COMANDO_NAO_CORRELACIONADO", error, acknowledgment);
        } catch(RuntimeException error) {
            retry(record, "CONSUMO_NAO_CONFIRMADO", error, acknowledgment);
        }
    }

    private SettlementCommand parse(ConsumerRecord<byte[],byte[]> record,
            Acknowledgment acknowledgment) {
        try {
            return parser.parse(record.key(), record.value());
        } catch(InvalidSettlementMessageException error) {
            quarantine(record, "COMANDO_MALFORMADO", error, acknowledgment);
            return null;
        } catch(RuntimeException error) {
            retry(record, "CONSUMO_NAO_CONFIRMADO", error, acknowledgment);
            return null;
        }
    }

    private void quarantine(ConsumerRecord<byte[],byte[]> record, String code, RuntimeException cause,
            Acknowledgment acknowledgment) {
        try {
            quarantine.quarantine(entry(record, code));
        } catch(RuntimeException error) {
            retry(record, "QUARENTENA_NAO_PERSISTIDA", error, acknowledgment);
            return;
        }
        LOG.atError().addKeyValue("code", code).addKeyValue("operation", "SETTLEMENT_QUARANTINE")
                .addKeyValue("topic", record.topic()).addKeyValue("partition", record.partition())
                .addKeyValue("offset", record.offset()).addKeyValue("keySha256", hash(record.key()))
                .addKeyValue("keySizeBytes", size(record.key())).addKeyValue("valueSha256", hash(record.value()))
                .addKeyValue("valueSizeBytes", size(record.value()))
                .addKeyValue("causeType", cause.getClass().getSimpleName())
                .setCause(sanitizedCause(cause))
                .log("[handler]:[error]: {} - Registro inválido persistido em quarentena.", code);
        try {
            acknowledgment.acknowledge();
            metrics.outcome("quarantined");
        } catch(RuntimeException error) {
            retry(record, "CONSUMO_NAO_CONFIRMADO", error, acknowledgment);
        }
    }

    private void retry(ConsumerRecord<byte[],byte[]> record, String code, RuntimeException error,
            Acknowledgment acknowledgment) {
        metrics.outcome("unacknowledged");
        LOG.atError().addKeyValue("code", code).addKeyValue("operation", "SETTLEMENT")
                .addKeyValue("topic", record.topic()).addKeyValue("partition", record.partition()).addKeyValue("offset", record.offset())
                .addKeyValue("retryAfterMs", 5000).setCause(error)
                .log("[handler]:[error]: {} - Não foi possível confirmar o consumo.", code);
        acknowledgment.nack(Duration.ofSeconds(5));
    }

    private SettlementQuarantineEntry entry(ConsumerRecord<byte[],byte[]> record, String code) {
        return new SettlementQuarantineEntry(record.topic(), record.partition(), record.offset(), hash(record.key()),
                size(record.key()), hash(record.value()), size(record.value()), code);
    }

    private String hash(byte[] value) {
        if (value == null) return null;
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch(NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 não está disponível.", impossible);
        }
    }

    private int size(byte[] value) {
        return value == null ? 0 : value.length;
    }

    private RuntimeException sanitizedCause(RuntimeException cause) {
        var safe = new RuntimeException("Falha de validação do comando; conteúdo de entrada omitido.");
        var frames = new ArrayList<StackTraceElement>();
        for (Throwable current = cause; current != null; current = current.getCause()) {
            frames.addAll(java.util.List.of(current.getStackTrace()));
        }
        safe.setStackTrace(frames.toArray(StackTraceElement[]::new));
        return safe;
    }
}
