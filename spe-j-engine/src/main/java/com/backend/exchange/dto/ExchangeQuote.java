package com.backend.exchange.dto;

import java.time.Instant;
import java.util.UUID;

public record ExchangeQuote(
    UUID uuid, UUID proposalUuid, String rate, Instant effectiveFrom, Instant validUntil) {}
