package com.backend.batch.service.impl;

import com.backend.batch.dto.*;
import com.backend.batch.model.*;
import com.backend.batch.repository.*;
import com.backend.batch.service.IBatchService;
import com.backend.common.audit.AuditService;
import com.backend.common.dto.Views;
import com.backend.common.security.ActorProvider;
import com.backend.common.validation.Inputs;
import com.backend.settlement.repository.FinancialTotalsRepository;
import com.backend.settlement.service.ISettlementQueryService;
import java.time.Clock;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class BatchServiceImpl implements IBatchService {
  private final ReceivableValidation validation;
  private final BatchWriteRepository writes;
  private final BatchQueryRepository queries;
  private final AuditService audit;
  private final ActorProvider actors;
  private final Clock clock;
  private final FinancialTotalsRepository totals;
  private final ISettlementQueryService requests;

  public BatchServiceImpl(
      ReceivableValidation validation,
      BatchWriteRepository writes,
      BatchQueryRepository queries,
      AuditService audit,
      ActorProvider actors,
      Clock clock,
      FinancialTotalsRepository totals,
      ISettlementQueryService requests) {
    this.validation = validation;
    this.writes = writes;
    this.queries = queries;
    this.audit = audit;
    this.actors = actors;
    this.clock = clock;
    this.totals = totals;
    this.requests = requests;
  }

  @Transactional
  public Map<String, Object> create(CreateBatch input) {
    return importItems(input.items(), "FORM");
  }

  @Transactional
  public Map<String, Object> importItems(List<ReceivableInput> items, String source) {
    var normalized = validation.validate(items, true);
    var id = UUID.randomUUID();
    var now = clock.instant();
    writes.insert(new Batch(id, now, source, normalized.size(), actors.current()));
    for (var item : normalized) {
      var receivableId = UUID.randomUUID();
      writes.insert(new Receivable(receivableId, id, now, item));
      writes.insert(new ReceivableProcessing(UUID.randomUUID(), receivableId, now));
    }
    writes.flush();
    audit.record(
        "BATCH_CREATED",
        Map.of("batch_uuid", id),
        Views.of("source", source, "itemCount", normalized.size()));
    return Views.of("uuid", id, "status", "READY");
  }

  public Object list(String q, String status, int page, int size) {
    Inputs.pagination(page, size);
    if (status != null)
      Inputs.choice(status, Set.of("READY", "PENDING", "SETTLED", "PARTIALLY_SETTLED", "FAILED"));
    return queries.list(q, status, page, size);
  }

  public Object detail(UUID uuid) {
    var view = queries.detail(uuid);
    var request = (UUID) view.remove("activeRequestUuid");
    view.put("activeRequest", request == null ? null : requests.get(request));
    view.put("settledTotals", totals.forBatch(uuid));
    return view;
  }

  public Object receivables(UUID uuid, String status, int page, int size) {
    Inputs.pagination(page, size);
    if (status != null) Inputs.choice(status, Set.of("READY", "PENDING", "SETTLED", "FAILED"));
    queries.require(uuid);
    return queries.receivables(uuid, status, page, size);
  }
}
