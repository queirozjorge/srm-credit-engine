package com.backend.settlement.service.impl;

import com.backend.common.audit.AuditService;
import com.backend.common.dto.Views;
import com.backend.common.exceptions.*;
import com.backend.common.pricing.*;
import com.backend.common.security.ActorProvider;
import com.backend.common.validation.Inputs;
import com.backend.exchange.service.IExchangeService;
import com.backend.pricing.service.impl.*;
import com.backend.settlement.dto.*;
import com.backend.settlement.repository.*;
import com.backend.settlement.service.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

@Service
public class SettlementServiceImpl implements ISettlementService {
  private static final Logger LOG = LoggerFactory.getLogger(SettlementServiceImpl.class);
  private record Result(UUID uuid, int status) {}

  private record Evaluated(
      AcceptanceRepository.Candidate item, PricingResult price, ApiException failure) {}

  private final AcceptanceRepository repository;
  private final FinancialTotalsRepository totals;
  private final ISettlementQueryService queries;
  private final PricingEngine pricing;
  private final PricingPolicy policy;
  private final IExchangeService exchange;
  private final AuditService audit;
  private final ActorProvider actors;
  private final Clock clock;
  private final ObjectMapper json;
  private final TransactionTemplate transaction;

  public SettlementServiceImpl(
      AcceptanceRepository repository,
      FinancialTotalsRepository totals,
      ISettlementQueryService queries,
      PricingEngine pricing,
      PricingPolicy policy,
      IExchangeService exchange,
      AuditService audit,
      ActorProvider actors,
      Clock clock,
      ObjectMapper json,
      PlatformTransactionManager transactions) {
    this.repository = repository;
    this.totals = totals;
    this.queries = queries;
    this.pricing = pricing;
    this.policy = policy;
    this.exchange = exchange;
    this.audit = audit;
    this.actors = actors;
    this.clock = clock;
    this.json = json;
    transaction = new TransactionTemplate(transactions);
  }

  public AcceptanceResponse accept(UUID batch, String key, SettlementInput input) {
    if (key == null || key.isBlank()) throw Inputs.invalid("Informe a chave de idempotência.");
    List<UUID> selected = null;
    String reason = null;
    if (input != null) {
      selected = input.receivableUuids();
      reason = Inputs.text(input.reason(), 500, "uma justificativa");
      if (selected == null
          || selected.isEmpty()
          || selected.size() > 1000
          || selected.contains(null)
          || new HashSet<>(selected).size() != selected.size())
        throw Inputs.invalid("Selecione entre 1 e 1.000 títulos distintos.");
      selected = selected.stream().sorted().toList();
    }
    var selection = selected;
    var justification = reason;
    var result =
        Objects.requireNonNull(
            transaction.execute(status -> execute(batch, key, selection, justification)));
    // The 422 response is produced only after commit; rejected attempts and audit must survive.
    Object body =
        result.status() == 422
            ? new ApiError(
                "NENHUM_TITULO_APTO",
                "Nenhum título está apto para liquidação. Consulte os motivos das falhas.",
                null,
                Map.of(
                    "batchUuid",
                    batch.toString(),
                    "requestUuid",
                    result.uuid().toString(),
                    "statusUrl",
                    "/api/settlement-requests/" + result.uuid()))
            : queries.get(result.uuid());
    return new AcceptanceResponse(result.status(), result.uuid(), body);
  }

  private Result execute(UUID batchId, String key, List<UUID> selected, String reason) {
    repository.lockKey(key);
    var existing = repository.existing(key);
    if (existing != null && !existing.batch().equals(batchId)) throw reused();
    var ids = selected == null ? repository.ids(batchId) : selected;
    var fingerprint =
        json.writeValueAsString(
            Views.of(
                "batchUuid",
                batchId,
                "kind",
                selected == null ? "INITIAL" : "REPROCESS",
                "receivableUuids",
                ids.stream().map(UUID::toString).sorted().toList(),
                "reason",
                reason));
    if (existing != null) {
      if (!existing.fingerprint().equals(fingerprint)) throw reused();
      return new Result(
          existing.uuid(),
          existing.acceptanceRejected() ? 422 : existing.status().equals("PENDING") ? 202 : 200);
    }
    var batch = repository.batch(batchId);
    if (batch.status().equals("PENDING"))
      throw new ApiException(
          409,
          "LOTE_EM_PROCESSAMENTO",
          "O lote já possui uma solicitação em andamento.",
          null,
          Map.of(
              "batchUuid",
              batchId.toString(),
              "requestUuid",
              batch.active().toString(),
              "statusUrl",
              "/api/settlement-requests/" + batch.active()));
    if (selected == null && batch.status().equals("SETTLED"))
      return new Result(batch.active(), 200);
    if (selected == null && !batch.status().equals("READY"))
      throw new ApiException(
          409,
          "REPROCESSAMENTO_EXIGE_SELECAO",
          "Selecione explicitamente os títulos falhos para reprocessar.");
    if (selected != null && !Set.of("FAILED", "PARTIALLY_SETTLED").contains(batch.status()))
      throw new ApiException(
          409,
          "TITULO_NAO_REPROCESSAVEL",
          "O lote não possui títulos disponíveis para reprocessamento.");
    var candidates = repository.candidates(batchId, ids, selected != null);
    var now = clock.instant();
    var date = now.atZone(ZoneId.of("America/Sao_Paulo")).toLocalDate();
    var quote = exchange.currentQuote(now);
    var evaluated = new ArrayList<Evaluated>();
    var aggregate = new FinancialAccumulator(totals.forBatch(batchId));
    int pending = 0;
    boolean usdAccepted = false;
    for (var candidate : candidates) {
      try {
        BigDecimal rate = null;
        if (candidate.currency().equals("USD")) {
          if (quote == null)
            throw new ApiException(
                422, "COTACAO_AUSENTE", "Não há cotação cadastrada para pagamento em dólares.");
          if (now.isAfter(quote.validUntil()))
            throw new ApiException(
                422, "COTACAO_EXPIRADA", "A cotação para pagamento em dólares está expirada.");
          rate = new BigDecimal(quote.rate());
        }
        var price =
            pricing.calculate(
                candidate.face(),
                candidate.type(),
                candidate.currency(),
                candidate.due(),
                date,
                policy.baseRate(),
                rate);
        aggregate.add(candidate.face(), candidate.currency(), price);
        evaluated.add(new Evaluated(candidate, price, null));
        pending++;
        usdAccepted |= candidate.currency().equals("USD");
      } catch (ApiException error) {
        if (error.status() != 422) throw error;
        LOG.atWarn().addKeyValue("code", error.code()).addKeyValue("operation", "settlement.accept")
            .addKeyValue("batchUuid", batchId).addKeyValue("receivableUuid", candidate.uuid())
            .setCause(error).log("[handler]:[error]: {} - {}", error.code(), error.getMessage());
        evaluated.add(new Evaluated(candidate, null, error));
      }
    }
    var request = UUID.randomUUID();
    repository.request(
        request,
        batch,
        key,
        fingerprint,
        selected == null ? "INITIAL" : "REPROCESS",
        reason,
        ids.size(),
        pending,
        now,
        date,
        policy.baseRate(),
        usdAccepted ? quote : null,
        actors.current());
    audit.record(
        selected == null ? "SETTLEMENT_REQUESTED" : "SETTLEMENT_REPROCESS_REQUESTED",
        Map.of("batch_uuid", batchId, "request_uuid", request),
        selected == null
            ? Views.of("receivableUuids", ids)
            : Views.of("receivableUuids", ids, "reason", reason));
    for (var item : evaluated) {
      var attempt = UUID.randomUUID();
      repository.attempt(attempt, request, item.item(), now, item.price(), item.failure());
      var references =
          Map.of(
              "batch_uuid",
              batchId,
              "request_uuid",
              request,
              "receivable_uuid",
              item.item().uuid(),
              "attempt_uuid",
              attempt);
      if (item.failure() == null) {
        repository.outbox(batchId, request, attempt, item.item().uuid(), key, now);
        audit.record(
            "RECEIVABLE_ATTEMPT_ACCEPTED",
            references,
            Views.of(
                "attemptNumber",
                item.item().ordinal(),
                "previousAttemptUuid",
                item.item().previous(),
                "termDays",
                item.price().days(),
                "spread",
                item.price().spread().toPlainString()));
      } else
        audit.record(
            "RECEIVABLE_ATTEMPT_REJECTED",
            references,
            Views.of(
                "failure",
                Views.of(
                    "code",
                    item.failure().code(),
                    "message",
                    item.failure().getMessage(),
                    "stage",
                    "ACCEPTANCE",
                    "occurredAt",
                    now)));
    }
    repository.completeBatch(batch, request, pending, now);
    return new Result(request, pending > 0 ? 202 : 422);
  }

  private ApiException reused() {
    return new ApiException(
        409,
        "CHAVE_IDEMPOTENCIA_REUTILIZADA",
        "A chave de idempotência já foi utilizada para outra solicitação.");
  }
}
