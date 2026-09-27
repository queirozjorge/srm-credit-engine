package com.backend.settlement.repository;

import com.backend.common.dto.*;
import com.backend.common.repository.Rows;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StatementRepository {
  private final NamedParameterJdbcTemplate jdbc;

  public StatementRepository(NamedParameterJdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Object list(
      Instant start, Instant end, UUID assignor, String currency, int page, int size) {
    var p = new HashMap<String, Object>();
    p.put("start", start == null ? null : Timestamp.from(start));
    p.put("end", end == null ? null : Timestamp.from(end));
    p.put("assignor", assignor);
    p.put("currency", currency);
    p.put("limit", size);
    p.put("offset", (long) (page - 1) * size);
    String from =
        " from settlement s join receivable r on r.uuid=s.receivable_uuid join assignor a on"
            + " a.uuid=r.assignor_uuid";
    String where =
        " where (cast(:start as timestamptz) is null or s.settled_at>=:start) and (cast(:end as"
            + " timestamptz) is null or s.settled_at<:end) and (cast(:assignor as uuid) is null or"
            + " r.assignor_uuid=:assignor) and (cast(:currency as text) is null or"
            + " s.payment_currency=:currency)";
    long total = jdbc.queryForObject("select count(*)" + from + where, p, Long.class);
    var items =
        jdbc.query(
            "select s.*,r.assignor_uuid,a.name as"
                + " assignor_name,r.external_reference,r.face_value_brl"
                + from
                + where
                + " order by s.settled_at desc,s.uuid desc limit :limit offset :offset",
            p,
            (r, n) ->
                Views.of(
                    "uuid",
                    Rows.uuid(r, "uuid"),
                    "batchUuid",
                    Rows.uuid(r, "batch_uuid"),
                    "requestUuid",
                    Rows.uuid(r, "request_uuid"),
                    "settledAt",
                    Rows.instant(r, "settled_at"),
                    "receivableUuid",
                    Rows.uuid(r, "receivable_uuid"),
                    "assignorUuid",
                    Rows.uuid(r, "assignor_uuid"),
                    "assignorName",
                    r.getString("assignor_name"),
                    "externalReference",
                    r.getString("external_reference"),
                    "paymentCurrency",
                    r.getString("payment_currency"),
                    "faceValueBrl",
                    Rows.money(r, "face_value_brl"),
                    "presentValueBrl",
                    Rows.money(r, "present_value_brl"),
                    "paymentValue",
                    Rows.money(r, "payment_amount")));
    return PageResponse.of(items, page, size, total);
  }
}
