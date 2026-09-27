package com.backend.outbox.model;

import java.util.UUID;

public record OutboxClaim(UUID uuid, UUID batchUuid, UUID receivableUuid, UUID requestUuid,
                          UUID attemptUuid, String topic, String payload, UUID token, long version) { }
