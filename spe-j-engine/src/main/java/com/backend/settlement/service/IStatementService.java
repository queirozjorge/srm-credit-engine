package com.backend.settlement.service;

import java.time.Instant;
import java.util.UUID;

public interface IStatementService {
  Object list(Instant start, Instant end, UUID assignor, String currency, int page, int size);
}
