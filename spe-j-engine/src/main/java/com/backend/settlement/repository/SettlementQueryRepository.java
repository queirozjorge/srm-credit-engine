package com.backend.settlement.repository;

import com.backend.common.dto.*;
import com.backend.common.repository.Rows;
import com.backend.common.validation.Inputs;
import java.sql.*;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SettlementQueryRepository {
  private final NamedParameterJdbcTemplate jdbc;

  public SettlementQueryRepository(NamedParameterJdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  private static final String SELECT =
      """
select q.*,e.proposal_uuid,x.*,a.actor_display_name requested_by_display_name from settlement_request q
left join exchange_rate e on e.uuid=q.exchange_rate_uuid
left join audit_event a on a.request_uuid=q.uuid and a.event_type=case q.kind
when 'INITIAL' then 'SETTLEMENT_REQUESTED' else 'SETTLEMENT_REPROCESS_REQUESTED' end
join lateral(select coalesce(sum(r.face_value_brl),0) face_value_brl,
coalesce(sum(s.present_value_brl),0) present_value_brl,coalesce(sum(s.discount_brl),0) discount_brl,
coalesce(sum(s.payment_amount) filter(where s.payment_currency='BRL'),0) payment_brl,
coalesce(sum(s.payment_amount) filter(where s.payment_currency='USD'),0) payment_usd
from settlement s join receivable r on r.uuid=s.receivable_uuid where s.request_uuid=q.uuid) x on true
""";

  public Map<String, Object> get(UUID uuid) {
    var found = jdbc.query(SELECT + " where q.uuid=:id", Map.of("id", uuid), this::map);
    if (found.isEmpty()) throw Inputs.missing();
    return found.getFirst();
  }

  public Object list(UUID batch, int page, int size) {
    var params = Map.of("id", batch, "limit", size, "offset", (long) (page - 1) * size);
    long total =
        jdbc.queryForObject(
            "select count(*) from settlement_request where batch_uuid=:id", params, Long.class);
    return PageResponse.of(
        jdbc.query(
            SELECT
                + " where q.batch_uuid=:id order by q.date_register desc,q.uuid desc limit :limit"
                + " offset :offset",
            params,
            this::map),
        page,
        size,
        total);
  }

  private Map<String, Object> map(ResultSet r, int row) throws SQLException {
    var rateId = Rows.uuid(r, "exchange_rate_uuid");
    var effective = Rows.instant(r, "exchange_rate_effective_from");
    Object quote =
        rateId == null
            ? null
            : Views.of(
                "uuid",
                rateId,
                "proposalUuid",
                Rows.uuid(r, "proposal_uuid"),
                "rate",
                r.getBigDecimal("exchange_rate_value").stripTrailingZeros().toPlainString(),
                "effectiveFrom",
                effective,
                "validUntil",
                effective.plusSeconds(86400));
    var id = Rows.uuid(r, "uuid");
    return Views.of(
        "uuid",
        id,
        "batchUuid",
        Rows.uuid(r, "batch_uuid"),
        "kind",
        r.getString("kind"),
        "reason",
        r.getString("reason"),
        "status",
        r.getString("status"),
        "statusUrl",
        "/api/settlement-requests/" + id,
        "acceptedAt",
        Rows.instant(r, "accepted_at"),
        "requestedBy",
        Views.of(
            "issuer",
            r.getString("requested_by_issuer"),
            "subject",
            r.getString("requested_by_subject"),
            "displayName",
            r.getString("requested_by_display_name")),
        "snapshot",
        Views.of(
            "calculationDate",
            r.getDate("calculation_date").toLocalDate(),
            "calculationVersion",
            r.getString("rule_version"),
            "dayCountConvention",
            r.getString("term_convention"),
            "baseRate",
            r.getBigDecimal("base_rate").stripTrailingZeros().toPlainString(),
            "exchangeRate",
            quote),
        "counts",
        Views.of(
            "ready",
            0,
            "pending",
            r.getInt("pending_count"),
            "settled",
            r.getInt("settled_count"),
            "failed",
            r.getInt("failed_count")),
        "settledTotals",
        Views.of(
            "faceValueBrl",
            Rows.money(r, "face_value_brl"),
            "presentValueBrl",
            Rows.money(r, "present_value_brl"),
            "discountBrl",
            Rows.money(r, "discount_brl"),
            "paymentBrl",
            Rows.money(r, "payment_brl"),
            "paymentUsd",
            Rows.money(r, "payment_usd")),
        "completedAt",
        Rows.instant(r, "completed_at"));
  }
}
