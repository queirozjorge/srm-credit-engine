package com.backend.exchange.dto;

import java.time.Instant;

public record ExchangeReference(String rate, Instant observedAt) {}
