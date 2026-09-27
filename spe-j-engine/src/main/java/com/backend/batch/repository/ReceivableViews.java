package com.backend.batch.repository;

import com.backend.common.dto.Views;
import com.backend.common.repository.Rows;
import java.sql.*;
import java.util.Map;

public final class ReceivableViews {
  private ReceivableViews() {}

  public static final String SELECT =
      """
select r.*,a.name as assignor_name,p.status as processing_status,p.has_error,p.attempt_number,
p.version as processing_version,p.active_attempt_uuid,t.request_uuid as active_request_uuid,
t.failure_code,t.failure_message,t.failure_stage,t.failure_occurred_at,s.uuid as settlement_uuid
from receivable r join assignor a on a.uuid=r.assignor_uuid
join receivable_processing p on p.receivable_uuid=r.uuid
left join settlement_request_item t on t.uuid=p.active_attempt_uuid
left join settlement s on s.receivable_uuid=r.uuid
""";

  public static Map<String, Object> map(ResultSet r, int row) throws SQLException {
    return Views.of(
        "uuid",
        Rows.uuid(r, "uuid"),
        "assignorUuid",
        Rows.uuid(r, "assignor_uuid"),
        "assignorName",
        r.getString("assignor_name"),
        "externalReference",
        r.getString("external_reference"),
        "type",
        r.getString("type"),
        "faceValueBrl",
        Rows.money(r, "face_value_brl"),
        "dueDate",
        r.getDate("due_date").toLocalDate(),
        "paymentCurrency",
        r.getString("payment_currency"),
        "processing",
        Views.of(
            "status",
            r.getString("processing_status"),
            "hasError",
            r.getBoolean("has_error"),
            "failure",
            failure(r),
            "activeRequestUuid",
            Rows.uuid(r, "active_request_uuid"),
            "attemptNumber",
            r.getInt("attempt_number"),
            "settlementUuid",
            Rows.uuid(r, "settlement_uuid")));
  }

  public static Object failure(ResultSet r) throws SQLException {
    if (r.getString("failure_code") == null) return null;
    return Views.of(
        "code",
        r.getString("failure_code"),
        "message",
        r.getString("failure_message"),
        "stage",
        r.getString("failure_stage"),
        "occurredAt",
        Rows.instant(r, "failure_occurred_at"));
  }
}
