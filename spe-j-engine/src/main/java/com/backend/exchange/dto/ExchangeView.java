package com.backend.exchange.dto;

import com.backend.common.dto.PageResponse;
import java.time.Instant;

public record ExchangeView(
    Instant evaluatedAt, ExchangeQuote current, String currentStatus, History history) {
  public record History(String kind, PageResponse<?> page) {}
}
