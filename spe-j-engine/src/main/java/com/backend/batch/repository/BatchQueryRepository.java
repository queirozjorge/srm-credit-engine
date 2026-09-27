package com.backend.batch.repository;

import com.backend.common.dto.*;
import com.backend.common.repository.Rows;
import com.backend.common.validation.Inputs;
import java.sql.*;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class BatchQueryRepository {
  private final NamedParameterJdbcTemplate jdbc;

  public BatchQueryRepository(NamedParameterJdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  private static final String SUMMARY =
      """
select b.*,x.assignor_count,x.sole_assignor_uuid,x.sole_assignor_name,x.face_value_brl
from batch b join lateral (select count(distinct r.assignor_uuid) assignor_count,
min(r.assignor_uuid::text) sole_assignor_uuid,min(a.name) sole_assignor_name,sum(r.face_value_brl) face_value_brl
from receivable r join assignor a on a.uuid=r.assignor_uuid where r.batch_uuid=b.uuid) x on true
""";

  public Object list(String q, String status, int page, int size) {
    var params = new HashMap<String, Object>();
    params.put("q", q.trim());
    params.put("status", status);
    params.put("limit", size);
    params.put("offset", (long) (page - 1) * size);
    String where =
        " where (:q='' or b.uuid::text ilike '%'||:q||'%' or exists(select 1 from receivable r join"
            + " assignor a on a.uuid=r.assignor_uuid where r.batch_uuid=b.uuid and a.name ilike"
            + " '%'||:q||'%')) and (cast(:status as text) is null or b.status=:status)";
    long total = jdbc.queryForObject("select count(*) from batch b" + where, params, Long.class);
    return PageResponse.of(
        jdbc.query(
            SUMMARY
                + where
                + " order by b.date_register desc,b.uuid desc limit :limit offset :offset",
            params,
            this::summary),
        page,
        size,
        total);
  }

  public Map<String, Object> detail(UUID uuid) {
    var list =
        jdbc.query(
            SUMMARY + " where b.uuid=:id",
            Map.of("id", uuid),
            (r, n) -> {
              var result = summary(r, n);
              result.put(
                  "createdBy",
                  Views.of(
                      "issuer",
                      r.getString("created_by_issuer"),
                      "subject",
                      r.getString("created_by_subject")));
              result.put("progressVersion", Long.toString(r.getLong("version")));
              result.put("activeRequestUuid", Rows.uuid(r, "active_request_uuid"));
              return result;
            });
    if (list.isEmpty()) throw Inputs.missing();
    return list.getFirst();
  }

  public void require(UUID uuid) {
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from batch where uuid=:id)",
            Map.of("id", uuid),
            Boolean.class))) throw Inputs.missing();
  }

  public Object receivables(UUID uuid, String status, int page, int size) {
    var params = new HashMap<String, Object>();
    params.put("id", uuid);
    params.put("status", status);
    params.put("limit", size);
    params.put("offset", (long) (page - 1) * size);
    var where = " where r.batch_uuid=:id and (cast(:status as text) is null or p.status=:status)";
    long total =
        jdbc.queryForObject(
            "select count(*) from receivable r join receivable_processing p on"
                + " p.receivable_uuid=r.uuid"
                + where,
            params,
            Long.class);
    return PageResponse.of(
        jdbc.query(
            ReceivableViews.SELECT + where + " order by r.uuid limit :limit offset :offset",
            params,
            ReceivableViews::map),
        page,
        size,
        total);
  }

  public List<Map<String, Object>> selected(UUID batch, List<UUID> ids) {
    if (ids != null && ids.isEmpty()) return List.of();
    var params = new HashMap<String, Object>();
    params.put("id", batch);
    if (ids != null) params.put("ids", ids);
    return jdbc.query(
        ReceivableViews.SELECT
            + " where r.batch_uuid=:id"
            + (ids == null ? "" : " and r.uuid in (:ids)")
            + " order by r.uuid",
        params,
        ReceivableViews::map);
  }

  private Map<String, Object> summary(ResultSet r, int n) throws SQLException {
    int count = r.getInt("assignor_count");
    return Views.of(
        "uuid",
        Rows.uuid(r, "uuid"),
        "source",
        r.getString("source"),
        "status",
        r.getString("status"),
        "itemCount",
        r.getInt("item_count"),
        "assignorCount",
        count,
        "soleAssignor",
        count == 1
            ? Views.of(
                "uuid",
                r.getString("sole_assignor_uuid"),
                "name",
                r.getString("sole_assignor_name"))
            : null,
        "faceValueBrl",
        Rows.money(r, "face_value_brl"),
        "registeredAt",
        Rows.instant(r, "date_register"),
        "counts",
        Views.of(
            "ready",
            r.getInt("ready_count"),
            "pending",
            r.getInt("pending_count"),
            "settled",
            r.getInt("settled_count"),
            "failed",
            r.getInt("failed_count")));
  }
}
