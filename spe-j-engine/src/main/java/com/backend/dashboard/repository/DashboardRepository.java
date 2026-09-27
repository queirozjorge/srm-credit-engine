package com.backend.dashboard.repository;

import com.backend.common.dto.Views;
import com.backend.common.repository.Rows;
import java.sql.Timestamp;
import java.time.*;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
public class DashboardRepository {
  private final NamedParameterJdbcTemplate jdbc;
  private final ObjectMapper json;

  public DashboardRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  public Object aggregate(
      String period, LocalDate first, LocalDate today, Instant start, Instant end, Instant now) {
    var p =
        Map.of(
            "start",
            Timestamp.from(start),
            "end",
            Timestamp.from(end),
            "now",
            Timestamp.from(now),
            "first",
            java.sql.Date.valueOf(first),
            "today",
            java.sql.Date.valueOf(today));
    var sql =
        """
with confirmed as materialized(select s.*,r.face_value_brl from settlement s join receivable r on r.uuid=s.receivable_uuid where s.settled_at>=:start and s.settled_at<:end),
daily as(select (settled_at at time zone 'America/Sao_Paulo')::date AS payment_date,
coalesce(sum(payment_amount) filter(where payment_currency='BRL'),0)::numeric(19,2) brl,
coalesce(sum(payment_amount) filter(where payment_currency='USD'),0)::numeric(19,2) usd from confirmed group by 1),
series as(select jsonb_agg(jsonb_build_object('date',d::date,'paymentBrl',coalesce(daily.brl,0)::numeric(19,2)::text,'paymentUsd',coalesce(daily.usd,0)::numeric(19,2)::text) order by d) AS daily_values
from generate_series(cast(:first as timestamp),cast(:today as timestamp),interval '1 day') d left join daily on daily.payment_date=d::date),
totals as(select coalesce(sum(face_value_brl),0) face_value_brl,coalesce(sum(present_value_brl),0) present_value_brl,coalesce(sum(discount_brl),0) discount_brl,
coalesce(sum(payment_amount) filter(where payment_currency='BRL'),0) payment_brl,coalesce(sum(payment_amount) filter(where payment_currency='USD'),0) payment_usd from confirmed),
counts as(select count(*) filter(where status='READY') ready,count(*) filter(where status='PENDING') pending,count(*) filter(where status='SETTLED') settled,count(*) filter(where status='PARTIALLY_SETTLED') partial,count(*) filter(where status='FAILED') failed from batch),
proposals as(select count(*) amount from exchange_rate_proposal where status='PENDING'),
quote as(select * from exchange_rate where effective_from<=:now order by effective_from desc,uuid desc limit 1)
select totals.*,counts.*,proposals.amount,series.daily_values::text as series_json,quote.uuid,quote.proposal_uuid,quote.rate,quote.effective_from
from totals cross join counts cross join proposals cross join series left join quote on true
""";
    return jdbc.queryForObject(
        sql,
        p,
        (r, n) -> {
          var rate = Rows.uuid(r, "uuid");
          var effective = Rows.instant(r, "effective_from");
          Object quote =
              rate == null
                  ? null
                  : Views.of(
                      "uuid",
                      rate,
                      "proposalUuid",
                      Rows.uuid(r, "proposal_uuid"),
                      "rate",
                      r.getBigDecimal("rate").stripTrailingZeros().toPlainString(),
                      "effectiveFrom",
                      effective,
                      "validUntil",
                      effective.plusSeconds(86400));
          var totals =
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
                  Rows.money(r, "payment_usd"));
          return Views.of(
              "generatedAt",
              now,
              "period",
              Views.of("kind", period, "start", start, "end", end, "timeZone", "America/Sao_Paulo"),
              "totals",
              totals,
              "dailyPayments",
              json.readTree(r.getString("series_json")),
              "batchCounts",
              Views.of(
                  "READY",
                  r.getLong("ready"),
                  "PENDING",
                  r.getLong("pending"),
                  "SETTLED",
                  r.getLong("settled"),
                  "PARTIALLY_SETTLED",
                  r.getLong("partial"),
                  "FAILED",
                  r.getLong("failed")),
              "pendingExchangeProposals",
              r.getLong("amount"),
              "exchange",
              Views.of(
                  "current",
                  quote,
                  "status",
                  rate == null
                      ? "ABSENT"
                      : now.isAfter(effective.plusSeconds(86400)) ? "EXPIRED" : "VALID"));
        });
  }
}
