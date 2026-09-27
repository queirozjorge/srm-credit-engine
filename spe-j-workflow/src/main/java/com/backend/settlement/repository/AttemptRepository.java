package com.backend.settlement.repository;

import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.exceptions.InvalidCommandException;
import com.backend.settlement.model.AttemptContext;
import com.backend.settlement.model.PricingSnapshot;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AttemptRepository {
    private final JdbcTemplate jdbc;
    public AttemptRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public AttemptContext find(SettlementCommand command) {
        var rows = jdbc.query("""
            SELECT a.uuid attempt_uuid,a.status,a.retry_count,a.next_retry_at,a.version attempt_version,
                p.active_attempt_uuid,p.version processing_version,b.version batch_version,q.version request_version,
                t.uuid terms_uuid,t.term_days,t.spread,r.face_value_brl,r.type,r.payment_currency,
                q.base_rate,q.exchange_rate_value,q.rule_version,q.term_convention,q.calculation_policy,q.rounding_policy,
                e.correlation_id
            FROM settlement_request_item a
            JOIN settlement_request q ON q.uuid=a.request_uuid
            JOIN batch b ON b.uuid=q.batch_uuid
            JOIN receivable r ON r.uuid=a.receivable_uuid AND r.batch_uuid=b.uuid
            JOIN receivable_processing p ON p.receivable_uuid=r.uuid
            LEFT JOIN receivable_terms t ON t.attempt_uuid=a.uuid
            JOIN audit_event e ON e.request_uuid=q.uuid
                AND e.event_type IN ('SETTLEMENT_REQUESTED','SETTLEMENT_REPROCESS_REQUESTED')
            WHERE q.uuid=? AND r.uuid=? AND b.uuid=? AND q.idempotency_key=? AND q.operation='SETTLEMENT'
            """, (rs, row) -> map(rs, command), command.requestUuid(), command.receivableUuid(),
                command.batchUuid(), command.idempotencyKey());
        if (rows.size() != 1) throw new InvalidCommandException("O comando não corresponde a uma solicitação autorizada persistida.");
        return rows.getFirst();
    }

    private AttemptContext map(ResultSet rs, SettlementCommand command) throws SQLException {
        var terms = rs.getObject("terms_uuid", UUID.class);
        PricingSnapshot snapshot = terms == null ? null : new PricingSnapshot(rs.getBigDecimal("face_value_brl"),
                rs.getString("type"),rs.getString("payment_currency"),rs.getInt("term_days"),
                rs.getBigDecimal("base_rate"),rs.getBigDecimal("spread"),rs.getBigDecimal("exchange_rate_value"),
                rs.getString("rule_version"),rs.getString("term_convention"),rs.getString("calculation_policy"),rs.getString("rounding_policy"));
        return new AttemptContext(command,rs.getObject("attempt_uuid",UUID.class),rs.getObject("active_attempt_uuid",UUID.class),
                terms,rs.getString("status"),rs.getInt("retry_count"),instant(rs,"next_retry_at"),
                rs.getLong("attempt_version"),rs.getLong("processing_version"),rs.getLong("batch_version"),
                rs.getLong("request_version"),rs.getString("correlation_id"),snapshot);
    }
    private Instant instant(ResultSet rs, String field) throws SQLException {
        var value = rs.getTimestamp(field);
        return value == null ? null : value.toInstant();
    }
}
