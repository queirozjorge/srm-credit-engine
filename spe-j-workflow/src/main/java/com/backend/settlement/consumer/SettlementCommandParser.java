package com.backend.settlement.consumer;

import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.exceptions.InvalidSettlementMessageException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class SettlementCommandParser {
    private static final Set<String> FIELDS=Set.of("batchUuid","receivableUuid","requestUuid","idempotencyKey");
    private static final int MAX_VALUE_BYTES=12_288;
    private final JsonMapper json;
    public SettlementCommandParser(JsonMapper json) { this.json=json; }
    public SettlementCommand parse(byte[] keyBytes,byte[] valueBytes) {
        try {
            if(valueBytes==null || valueBytes.length>MAX_VALUE_BYTES)
                throw new IllegalArgumentException("Payload ausente ou acima do limite.");
            String key=utf8(keyBytes,"Chave Kafka");
            String value=utf8(valueBytes,"Payload");
            if(value.length()>4096) throw new IllegalArgumentException("Payload acima do limite.");
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
            throw new InvalidSettlementMessageException("O comando de liquidação não corresponde ao contrato.",error);
        }
    }
    private String utf8(byte[] bytes,String field) {
        if(bytes==null) throw new IllegalArgumentException(field+" ausente.");
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch(CharacterCodingException error) {
            throw new IllegalArgumentException(field+" não contém UTF-8 válido.",error);
        }
    }
    private UUID uuid(String text) {
        var value=UUID.fromString(text);
        if(!value.toString().equals(text)) throw new IllegalArgumentException("UUID inválido.");
        return value;
    }
}
