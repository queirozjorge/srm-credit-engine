package com.backend.settlement.repository;

import com.backend.common.dto.Views;
import com.backend.common.repository.Rows;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FinancialTotalsRepository {
  private final NamedParameterJdbcTemplate jdbc;

  public FinancialTotalsRepository(NamedParameterJdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public static final String COLUMNS =
      """
coalesce(sum(r.face_value_brl),0) face_value_brl,coalesce(sum(s.present_value_brl),0) present_value_brl,
coalesce(sum(s.discount_brl),0) discount_brl,
coalesce(sum(s.payment_amount) filter(where s.payment_currency='BRL'),0) payment_brl,
coalesce(sum(s.payment_amount) filter(where s.payment_currency='USD'),0) payment_usd
""";

  public Map<String, Object> forBatch(UUID id) {
    return totals("s.batch_uuid=:id", Map.of("id", id));
  }

  public Map<String, Object> forRequest(UUID id) {
    return totals("s.request_uuid=:id", Map.of("id", id));
  }

  public Map<String, Object> totals(String predicate, Map<String, ?> params) {
    return jdbc.queryForObject(
        "select "
            + COLUMNS
            + " from settlement s join receivable r on r.uuid=s.receivable_uuid where "
            + predicate,
        params,
        (r, n) ->
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
                Rows.money(r, "payment_usd")));
  }
}
