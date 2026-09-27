package com.backend.settlement.model;

import com.backend.settlement.dto.SettlementCommand;
import java.time.Instant;
import java.util.UUID;

public record AttemptContext(SettlementCommand command, UUID attemptUuid, UUID activeAttemptUuid,
        UUID termsUuid, String status, int retryCount, Instant nextRetryAt,
        long attemptVersion, long processingVersion, long batchVersion, long requestVersion,
        String correlationId, PricingSnapshot snapshot) {
    public boolean terminalOrObsolete() {
        return !"PENDING".equals(status) || !attemptUuid.equals(activeAttemptUuid);
    }
}
