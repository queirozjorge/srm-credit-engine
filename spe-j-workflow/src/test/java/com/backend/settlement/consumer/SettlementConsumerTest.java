package com.backend.settlement.consumer;

import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.exceptions.InvalidCommandException;
import com.backend.settlement.model.ProcessingOutcome;
import com.backend.settlement.service.ISettlementService;
import com.backend.settlement.service.impl.SettlementMetrics;
import java.time.Duration;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
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
        assertEquals(command,parser.parse(command.receivableUuid().toString(),payload));
        assertThrows(InvalidCommandException.class,() -> parser.parse(UUID.randomUUID().toString(),payload));
        assertThrows(InvalidCommandException.class,() -> parser.parse(command.receivableUuid().toString(),payload.replace("}",",\"amount\":\"1.00\"}")));
        assertThrows(InvalidCommandException.class,() -> parser.parse(command.receivableUuid().toString(),"null"));
    }
    @Test void acknowledgesOnlyDurableOutcomeAndRetainsOffsetOnFailure() {
        var service=mock(ISettlementService.class);
        var ack=mock(Acknowledgment.class);
        var consumer=new SettlementConsumer(parser,service,mock(SettlementMetrics.class));
        var record=new ConsumerRecord<>("credit-receivable",0,0L,command.receivableUuid().toString(),json.writeValueAsString(command));
        when(service.process(command)).thenReturn(ProcessingOutcome.retry(Duration.ofSeconds(5)));
        consumer.receive(record,ack);
        verify(ack).nack(Duration.ofSeconds(5));verify(ack,never()).acknowledge();
        reset(ack);
        when(service.process(command)).thenReturn(ProcessingOutcome.complete());
        consumer.receive(record,ack);verify(ack).acknowledge();
        reset(ack);
        when(service.process(command)).thenThrow(new IllegalStateException("Banco indisponível."));
        consumer.receive(record,ack);verify(ack).nack(Duration.ofSeconds(1));verify(ack,never()).acknowledge();
    }
}
