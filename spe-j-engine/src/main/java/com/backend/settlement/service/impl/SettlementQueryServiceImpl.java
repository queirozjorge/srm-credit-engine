package com.backend.settlement.service.impl;

import com.backend.batch.repository.BatchQueryRepository;
import com.backend.common.validation.Inputs;
import com.backend.settlement.repository.*;
import com.backend.settlement.service.ISettlementQueryService;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SettlementQueryServiceImpl implements ISettlementQueryService {
  private final SettlementQueryRepository requests;
  private final SettlementHistoryRepository history;
  private final BatchQueryRepository batches;

  public SettlementQueryServiceImpl(
      SettlementQueryRepository requests,
      SettlementHistoryRepository history,
      BatchQueryRepository batches) {
    this.requests = requests;
    this.history = history;
    this.batches = batches;
  }

  public Map<String, Object> get(UUID uuid) {
    return requests.get(uuid);
  }

  public Object list(UUID batch, int page, int size) {
    Inputs.pagination(page, size);
    batches.require(batch);
    return requests.list(batch, page, size);
  }

  public Object items(UUID id, String status, int page, int size) {
    Inputs.pagination(page, size);
    if (status != null) Inputs.choice(status, Set.of("PENDING", "SETTLED", "FAILED"));
    requests.get(id);
    return history.items(id, status, page, size);
  }

  public Object audit(UUID batch, UUID receivable, int page, int size) {
    Inputs.pagination(page, size);
    batches.require(batch);
    if (receivable != null && batches.selected(batch, List.of(receivable)).isEmpty())
      throw Inputs.missing();
    return history.audit(batch, receivable, page, size);
  }
}
