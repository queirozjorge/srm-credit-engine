package com.backend.settlement.consumer;

import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.exceptions.InvalidCommandException;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class SettlementCommandParser {
    private static final Set<String> FIELDS=Set.of("batchUuid","receivableUuid","requestUuid","idempotencyKey");
    private final JsonMapper json;
    public SettlementCommandParser(JsonMapper json) { this.json=json; }
    public SettlementCommand parse(String key,String value) {
        try {
            if(value==null || value.length()>4096) throw new IllegalArgumentException("Payload ausente ou acima do limite.");
            var tree=json.readTree(value);
            var fields=new HashSet<String>();
            tree.propertyNames().forEach(fields::add);
            if(!tree.isObject() || !fields.equals(FIELDS) || FIELDS.stream().anyMatch(field -> !tree.path(field).isTextual()))
                throw new IllegalArgumentException("Campos incompatíveis com o contrato.");
            UUID receivable=uuid(tree.path("receivableUuid").asString());
            if(!receivable.toString().equals(key)) throw new IllegalArgumentException("Chave Kafka diferente do título.");
            return new SettlementCommand(uuid(tree.path("batchUuid").asString()),receivable,
                    uuid(tree.path("requestUuid").asString()),tree.path("idempotencyKey").asString());
        } catch(RuntimeException error) {
            throw new InvalidCommandException("O comando de liquidação é inválido.",error);
        }
    }
    private UUID uuid(String text) {
        var value=UUID.fromString(text);
        if(!value.toString().equals(text)) throw new IllegalArgumentException("UUID inválido.");
        return value;
    }
}
