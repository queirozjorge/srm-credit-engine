package com.backend.settlement.repository;

import com.backend.batch.repository.ReceivableViews;
import com.backend.common.dto.*;
import com.backend.common.repository.Rows;
import java.math.*;
import java.sql.*;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
public class SettlementHistoryRepository {
  private final NamedParameterJdbcTemplate jdbc;
  private final ObjectMapper mapper;

  public SettlementHistoryRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.mapper = mapper;
  }

  public Object items(UUID request, String status, int page, int size) {
    var params = params(request, page, size);
    params.put("status", status);
    var where = " where h.request_uuid=:id and (cast(:status as text) is null or h.status=:status)";
    long total =
        jdbc.queryForObject(
            "select count(*) from settlement_request_item h" + where, params, Long.class);
    var select =
        ReceivableViews.SELECT.replace(
            "select r.*",
            "select h.uuid as history_uuid,h.request_uuid as"
                + " history_request,h.previous_attempt_uuid,h.attempt_number as"
                + " history_number,h.status as history_status,h.has_error as"
                + " history_error,h.retry_count,h.next_retry_at,h.completed_at,h.failure_code as"
                + " history_code,h.failure_message as history_message,h.failure_stage as"
                + " history_stage,h.failure_occurred_at as"
                + " history_occurred,terms.term_days,terms.spread,result.uuid as"
                + " result_uuid,result.settled_at,result.present_value_brl,result.discount_brl,result.payment_amount,result.payment_currency"
                + " as result_currency,r.*");
    select +=
        " join settlement_request_item h on h.receivable_uuid=r.uuid left join receivable_terms"
            + " terms on terms.attempt_uuid=h.uuid left join settlement result on"
            + " result.attempt_uuid=h.uuid";
    return PageResponse.of(
        jdbc.query(
            select + where + " order by r.uuid limit :limit offset :offset", params, this::item),
        page,
        size,
        total);
  }

  public Object audit(UUID batch, UUID receivable, int page, int size) {
    var params = params(batch, page, size);
    params.put("receivable", receivable);
    var where =
        " where batch_uuid=:id and (cast(:receivable as uuid) is null or"
            + " receivable_uuid=:receivable)";
    long total =
        jdbc.queryForObject("select count(*) from audit_event" + where, params, Long.class);
    var events =
        jdbc.query(
            "select *,details::text as details_json from audit_event"
                + where
                + " order by date_register,uuid limit :limit offset :offset",
            params,
            (r, n) ->
                Views.of(
                    "uuid",
                    Rows.uuid(r, "uuid"),
                    "batchUuid",
                    Rows.uuid(r, "batch_uuid"),
                    "receivableUuid",
                    Rows.uuid(r, "receivable_uuid"),
                    "requestUuid",
                    Rows.uuid(r, "request_uuid"),
                    "attemptUuid",
                    Rows.uuid(r, "attempt_uuid"),
                    "eventType",
                    r.getString("event_type"),
                    "actor",
                    Views.of(
                        "issuer",
                        r.getString("actor_issuer"),
                        "subject",
                        r.getString("actor_subject")),
                    "registeredAt",
                    Rows.instant(r, "date_register"),
                    "correlationId",
                    r.getString("correlation_id"),
                    "details",
                    mapper.readTree(r.getString("details_json"))));
    return PageResponse.of(events, page, size, total);
  }

  private Map<String, Object> params(UUID id, int page, int size) {
    var p = new HashMap<String, Object>();
    p.put("id", id);
    p.put("limit", size);
    p.put("offset", (long) (page - 1) * size);
    return p;
  }

  private Map<String, Object> item(ResultSet r, int n) throws SQLException {
    Object failure =
        r.getString("history_code") == null
            ? null
            : Views.of(
                "code",
                r.getString("history_code"),
                "message",
                r.getString("history_message"),
                "stage",
                r.getString("history_stage"),
                "occurredAt",
                Rows.instant(r, "history_occurred"));
    Object terms =
        r.getObject("term_days") == null
            ? null
            : Views.of(
                "days",
                r.getInt("term_days"),
                "termMonths",
                BigDecimal.valueOf(r.getInt("term_days"))
                    .divide(new BigDecimal("30"), new MathContext(50, RoundingMode.HALF_EVEN))
                    .toPlainString(),
                "spread",
                r.getBigDecimal("spread").stripTrailingZeros().toPlainString());
    Object result =
        Rows.uuid(r, "result_uuid") == null
            ? null
            : Views.of(
                "uuid",
                Rows.uuid(r, "result_uuid"),
                "settledAt",
                Rows.instant(r, "settled_at"),
                "presentValueBrl",
                Rows.money(r, "present_value_brl"),
                "discountBrl",
                Rows.money(r, "discount_brl"),
                "paymentCurrency",
                r.getString("result_currency"),
                "paymentValue",
                Rows.money(r, "payment_amount"));
    return Views.of(
        "uuid",
        Rows.uuid(r, "history_uuid"),
        "requestUuid",
        Rows.uuid(r, "history_request"),
        "receivable",
        ReceivableViews.map(r, n),
        "attemptNumber",
        r.getInt("history_number"),
        "previousAttemptUuid",
        Rows.uuid(r, "previous_attempt_uuid"),
        "status",
        r.getString("history_status"),
        "hasError",
        r.getBoolean("history_error"),
        "retryCount",
        r.getInt("retry_count"),
        "nextRetryAt",
        Rows.instant(r, "next_retry_at"),
        "terms",
        terms,
        "completedAt",
        Rows.instant(r, "completed_at"),
        "failure",
        failure,
        "result",
        result);
  }
}
