package com.backend.settlement.service;

import java.util.Map;
import java.util.UUID;

public interface ISettlementQueryService {
  Map<String, Object> get(UUID uuid);

  Object list(UUID batch, int page, int size);

  Object items(UUID request, String status, int page, int size);

  Object audit(UUID batch, UUID receivable, int page, int size);
}
