package com.backend.settlement.repository;

import com.backend.common.exceptions.ApiException;
import com.backend.common.pricing.PricingEngine;
import com.backend.common.pricing.PricingResult;
import com.backend.common.repository.Rows;
import com.backend.common.security.Actor;
import com.backend.common.validation.Inputs;
import com.backend.exchange.dto.ExchangeQuote;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
public class AcceptanceRepository {
  public record BatchState(
      UUID uuid,
      UUID active,
      String status,
      int itemCount,
      int settled,
      int failed,
      long version) {}

  public record Existing(
      UUID uuid, UUID batch, String fingerprint, String status, boolean acceptanceRejected) {}

  public record Candidate(
      UUID uuid,
      String type,
      String currency,
      BigDecimal face,
      LocalDate due,
      UUID previous,
      int ordinal,
      long version) {}

  private final JdbcTemplate jdbc;
  private final NamedParameterJdbcTemplate named;
  private final ObjectMapper json;

  public AcceptanceRepository(
      JdbcTemplate jdbc, NamedParameterJdbcTemplate named, ObjectMapper json) {
    this.jdbc = jdbc;
    this.named = named;
    this.json = json;
  }

  public void lockKey(String key) {
    jdbc.query(
        "select pg_advisory_xact_lock(hashtextextended(?,0))", (r, n) -> 0, "SETTLEMENT:" + key);
  }

  public Existing existing(String key) {
    var found =
        jdbc.query(
            """
select q.uuid,q.batch_uuid,q.request_fingerprint,q.status,
not exists(select 1 from settlement_request_item t where t.request_uuid=q.uuid and t.failure_stage is distinct from 'ACCEPTANCE') rejected
from settlement_request q where operation='SETTLEMENT' and idempotency_key=?
""",
            (r, n) ->
                new Existing(
                    Rows.uuid(r, "uuid"),
                    Rows.uuid(r, "batch_uuid"),
                    r.getString("request_fingerprint"),
                    r.getString("status"),
                    r.getBoolean("rejected")),
            key);
    return found.isEmpty() ? null : found.getFirst();
  }

  public BatchState batch(UUID id) {
    var found =
        jdbc.query(
            "select * from batch where uuid=? for update",
            (r, n) ->
                new BatchState(
                    id,
                    Rows.uuid(r, "active_request_uuid"),
                    r.getString("status"),
                    r.getInt("item_count"),
                    r.getInt("settled_count"),
                    r.getInt("failed_count"),
                    r.getLong("version")),
            id);
    if (found.isEmpty()) throw Inputs.missing();
    return found.getFirst();
  }

  public List<UUID> ids(UUID batch) {
    return jdbc.query(
        "select uuid from receivable where batch_uuid=? order by uuid",
        (r, n) -> Rows.uuid(r, "uuid"),
        batch);
  }

  public List<Candidate> candidates(UUID batch, List<UUID> ids, boolean reprocess) {
    var values =
        named.query(
            """
            select r.*,p.active_attempt_uuid,p.attempt_number,p.version,p.status
            from receivable r join receivable_processing p on p.receivable_uuid=r.uuid
            where r.batch_uuid=:batch and r.uuid in (:ids) order by r.uuid
            """,
            Map.of("batch", batch, "ids", ids),
            (r, n) -> {
              if (!r.getString("status").equals(reprocess ? "FAILED" : "READY"))
                throw new ApiException(
                    409,
                    "TITULO_NAO_REPROCESSAVEL",
                    "A seleção contém título não disponível para esta operação.");
              return new Candidate(
                  Rows.uuid(r, "uuid"),
                  r.getString("type"),
                  r.getString("payment_currency"),
                  r.getBigDecimal("face_value_brl"),
                  r.getDate("due_date").toLocalDate(),
                  Rows.uuid(r, "active_attempt_uuid"),
                  r.getInt("attempt_number") + 1,
                  r.getLong("version"));
            });
    if (values.size() != ids.size())
      throw new ApiException(
          409, "TITULO_NAO_REPROCESSAVEL", "A seleção contém título de outro lote.");
    return values;
  }

  public void request(
      UUID id,
      BatchState batch,
      String key,
      String fingerprint,
      String kind,
      String reason,
      int count,
      int pending,
      Instant now,
      LocalDate date,
      BigDecimal base,
      ExchangeQuote quote,
      Actor actor) {
    update(
        """
insert into settlement_request(uuid,batch_uuid,operation,kind,reason,idempotency_key,request_fingerprint,status,
item_count,pending_count,settled_count,failed_count,accepted_at,completed_at,requested_by_issuer,requested_by_subject,
calculation_date,term_convention,base_rate,rule_version,calculation_policy,rounding_policy,
exchange_rate_uuid,exchange_rate_value,exchange_rate_effective_from,version,date_register)
values(?,?,'SETTLEMENT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTUAL_30',?,?,'DECIMAL_50','HALF_EVEN',?,?,?,0,?)
""",
        id,
        batch.uuid(),
        kind,
        reason,
        key,
        fingerprint,
        pending > 0 ? "PENDING" : "FAILED",
        count,
        pending,
        0,
        count - pending,
        now,
        pending > 0 ? null : now,
        actor.issuer(),
        actor.subject(),
        date,
        base,
        PricingEngine.RULE_VERSION,
        quote == null ? null : quote.uuid(),
        quote == null ? null : new BigDecimal(quote.rate()),
        quote == null ? null : quote.effectiveFrom(),
        now);
  }

  public void attempt(
      UUID id,
      UUID request,
      Candidate candidate,
      Instant now,
      PricingResult result,
      ApiException failure) {
    update(
        """
insert into settlement_request_item(uuid,request_uuid,receivable_uuid,previous_attempt_uuid,attempt_number,status,
retry_count,completed_at,failure_code,failure_message,failure_stage,failure_occurred_at,version,date_register)
values(?,?,?,?,?,?,0,?,?,?,?,?,0,?)
""",
        id,
        request,
        candidate.uuid(),
        candidate.previous(),
        candidate.ordinal(),
        failure == null ? "PENDING" : "FAILED",
        failure == null ? null : now,
        failure == null ? null : failure.code(),
        failure == null ? null : failure.getMessage(),
        failure == null ? null : "ACCEPTANCE",
        failure == null ? null : now,
        now);
    if (result != null)
      update(
          "insert into receivable_terms(uuid,attempt_uuid,term_days,spread,date_register)"
              + " values(?,?,?,?,?)",
          UUID.randomUUID(),
          id,
          result.days(),
          result.spread(),
          now);
    int changed =
        update(
            """
update receivable_processing set active_attempt_uuid=?,attempt_number=?,status=?,version=version+1,date_updated=?
where receivable_uuid=? and version=? and status in ('READY','FAILED')
""",
            id,
            candidate.ordinal(),
            failure == null ? "PENDING" : "FAILED",
            now,
            candidate.uuid(),
            candidate.version());
    if (changed != 1)
      throw new ApiException(
          409, "VERSAO_DESATUALIZADA", "O título foi alterado por outra operação.");
  }

  public void outbox(
      UUID batch, UUID request, UUID attempt, UUID receivable, String key, Instant now) {
    var payload =
        json.writeValueAsString(
            Map.of(
                "batchUuid",
                batch.toString(),
                "receivableUuid",
                receivable.toString(),
                "requestUuid",
                request.toString(),
                "idempotencyKey",
                key));
    update(
        """
insert into outbox_message(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,topic,status,payload,publish_attempts,next_attempt_at,version,date_register)
values(?,?,?,?,?,'credit-receivable','READY',cast(? as jsonb),0,?,0,?)
""",
        UUID.randomUUID(),
        batch,
        request,
        receivable,
        attempt,
        payload,
        now,
        now);
  }

  public void completeBatch(BatchState batch, UUID request, int pending, Instant now) {
    int failed = batch.itemCount() - batch.settled() - pending;
    String status = pending > 0 ? "PENDING" : batch.settled() > 0 ? "PARTIALLY_SETTLED" : "FAILED";
    int changed =
        update(
            "update batch set"
                + " active_request_uuid=?,status=?,ready_count=0,pending_count=?,failed_count=?,version=version+1,date_updated=?"
                + " where uuid=? and version=?",
            request,
            status,
            pending,
            failed,
            now,
            batch.uuid(),
            batch.version());
    if (changed != 1)
      throw new ApiException(
          409, "VERSAO_DESATUALIZADA", "O lote foi alterado por outra operação.");
  }

  private int update(String sql, Object... args) {
    for (int i = 0; i < args.length; i++) {
      if (args[i] instanceof Instant instant) args[i] = Timestamp.from(instant);
      else if (args[i] instanceof LocalDate date) args[i] = java.sql.Date.valueOf(date);
    }
    return jdbc.update(sql, args);
  }
}
