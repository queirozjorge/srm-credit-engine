package com.backend.exchange.dto;

import com.backend.common.security.Actor;
import java.time.Instant;
import java.util.UUID;

public record ExchangeProposal(
    UUID uuid,
    String proposedRate,
    String justification,
    String status,
    Actor requestedBy,
    Instant registeredAt,
    String version,
    Decision decision) {
  public record Decision(
      String status, Actor decidedBy, Instant decidedAt, String reason, ExchangeQuote quote) {}
}
