package com.backend.settlement.consumer;

import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.exceptions.InvalidCommandException;
import com.backend.settlement.exceptions.InvalidSettlementMessageException;
import com.backend.settlement.model.ProcessingOutcome;
import com.backend.settlement.model.SettlementQuarantineEntry;
import com.backend.settlement.service.ISettlementQuarantineService;
import com.backend.settlement.service.ISettlementService;
import com.backend.settlement.service.impl.SettlementMetrics;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.kafka.support.Acknowledgment;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SettlementConsumerTest {
    private final JsonMapper json=JsonMapper.builder().build();
    private final SettlementCommand command=new SettlementCommand(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"key");
    private final SettlementCommandParser parser=new SettlementCommandParser(json);
    @Test void acceptsExactContractAndRejectsMoneyOrWrongKey() {
        String payload=json.writeValueAsString(command);
        assertEquals(command,parser.parse(utf8(command.receivableUuid().toString()),utf8(payload)));
        assertThrows(InvalidSettlementMessageException.class,() -> parser.parse(utf8(UUID.randomUUID().toString()),utf8(payload)));
        assertThrows(InvalidSettlementMessageException.class,() -> parser.parse(utf8(command.receivableUuid().toString()),utf8(payload.replace("}",",\"amount\":\"1.00\"}"))));
        assertThrows(InvalidSettlementMessageException.class,() -> parser.parse(utf8(command.receivableUuid().toString()),utf8("null")));
        assertThrows(InvalidSettlementMessageException.class,() -> parser.parse(utf8(command.receivableUuid().toString()),new byte[]{'{',(byte)0xC3,0x28}));
        assertThrows(InvalidSettlementMessageException.class,() -> parser.parse(new byte[]{(byte)0xC3,0x28},utf8("{}")));
    }
    @Test void acknowledgesOnlyDurableOutcomeAndRetainsOffsetOnFailure() {
        var service=mock(ISettlementService.class);
        var quarantine=mock(ISettlementQuarantineService.class);
        var ack=mock(Acknowledgment.class);
        var consumer=new SettlementConsumer(parser,service,quarantine,mock(SettlementMetrics.class));
        var record=record(0,0L,utf8(command.receivableUuid().toString()),utf8(json.writeValueAsString(command)));
        when(service.process(command)).thenReturn(ProcessingOutcome.retry(Duration.ofSeconds(5)));
        consumer.receive(record,ack);
        verify(ack).nack(Duration.ofSeconds(5));verify(ack,never()).acknowledge();
        reset(ack);
        when(service.process(command)).thenReturn(ProcessingOutcome.complete());
        consumer.receive(record,ack);verify(ack).acknowledge();
        reset(ack);
        when(service.process(command)).thenThrow(new IllegalStateException("Banco indisponível."));
        consumer.receive(record,ack);verify(ack).nack(Duration.ofSeconds(5));verify(ack,never()).acknowledge();
    }

    @Test void persistsOnlyFingerprintOfMalformedRecordBeforeAcknowledging() {
        var service=mock(ISettlementService.class);
        var quarantine=mock(ISettlementQuarantineService.class);
        var ack=mock(Acknowledgment.class);
        var consumer=new SettlementConsumer(parser,service,quarantine,mock(SettlementMetrics.class));
        byte[] rawKey={(byte)0xC3,0x28};
        byte[] rawValue={'{',(byte)0xC3,0x28};
        var record=record(2,17L,rawKey,rawValue);

        consumer.receive(record,ack);

        var order=inOrder(quarantine,ack);
        order.verify(quarantine).quarantine(argThat(entry -> entry.sourceTopic().equals("credit-receivable")
                && entry.sourcePartition()==2 && entry.sourceOffset()==17
                && entry.keySha256().equals(sha256(rawKey)) && entry.keySizeBytes()==rawKey.length
                && entry.valueSha256().equals(sha256(rawValue)) && entry.valueSizeBytes()==rawValue.length
                && entry.failureCode().equals("COMANDO_MALFORMADO")));
        order.verify(ack).acknowledge();
        verify(service,never()).process(any());
    }

    @Test void quarantinesUncorrelatedCommandWithoutFailingAnUnmatchedTitle() {
        var service=mock(ISettlementService.class);
        var quarantine=mock(ISettlementQuarantineService.class);
        var ack=mock(Acknowledgment.class);
        var consumer=new SettlementConsumer(parser,service,quarantine,mock(SettlementMetrics.class));
        var record=record(0,4L,utf8(command.receivableUuid().toString()),utf8(json.writeValueAsString(command)));
        when(service.process(command)).thenThrow(new InvalidCommandException("Comando sem tentativa correspondente."));

        consumer.receive(record,ack);

        verify(quarantine).quarantine(argThat(entry -> entry.failureCode().equals("COMANDO_NAO_CORRELACIONADO")
                && entry.sourcePartition()==0 && entry.sourceOffset()==4));
        verify(ack).acknowledge();
        verify(ack,never()).nack(any(Duration.class));
    }

    @Test void retainsOffsetWithFiveSecondBackoffWhenQuarantinePersistenceFails() {
        var service=mock(ISettlementService.class);
        var quarantine=mock(ISettlementQuarantineService.class);
        var ack=mock(Acknowledgment.class);
        var consumer=new SettlementConsumer(parser,service,quarantine,mock(SettlementMetrics.class));
        var record=record(1,8L,utf8("bad-key"),utf8("invalid"));
        doThrow(new DataAccessResourceFailureException("Banco indisponível."))
                .when(quarantine).quarantine(any(SettlementQuarantineEntry.class));

        consumer.receive(record,ack);

        verify(quarantine).quarantine(any(SettlementQuarantineEntry.class));
        verify(ack).nack(Duration.ofSeconds(5));
        verify(ack,never()).acknowledge();
        verify(service,never()).process(any());
    }

    private ConsumerRecord<byte[],byte[]> record(int partition,long offset,byte[] key,byte[] value) {
        return new ConsumerRecord<>("credit-receivable",partition,offset,key,value);
    }
    private byte[] utf8(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    private String sha256(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch(Exception impossible) { throw new AssertionError(impossible); }
    }
}
