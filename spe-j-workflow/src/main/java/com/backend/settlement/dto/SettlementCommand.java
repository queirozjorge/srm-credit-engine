package com.backend.settlement.dto;

import java.util.Objects;
import java.util.UUID;

public record SettlementCommand(UUID batchUuid, UUID receivableUuid, UUID requestUuid, String idempotencyKey) {
    public SettlementCommand {
        Objects.requireNonNull(batchUuid, "Lote obrigatório.");
        Objects.requireNonNull(receivableUuid, "Título obrigatório.");
        Objects.requireNonNull(requestUuid, "Solicitação obrigatória.");
        if (idempotencyKey == null || idempotencyKey.isBlank())
            throw new IllegalArgumentException("Chave de idempotência obrigatória.");
    }
}
