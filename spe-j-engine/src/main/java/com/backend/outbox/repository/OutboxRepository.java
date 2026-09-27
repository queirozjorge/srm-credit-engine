package com.backend.outbox.repository;

import com.backend.outbox.model.OutboxClaim;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.Optional;
import java.util.UUID;

@Repository
public class OutboxRepository {
    private final JdbcTemplate jdbc;
    public OutboxRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public double oldestAgeSeconds(Instant now) {
        Double age = jdbc.queryForObject("""
            SELECT COALESCE(EXTRACT(EPOCH FROM (CAST(? AS timestamptz)-min(date_register))),0)
            FROM outbox_message WHERE status<>'SENT'
            """, Double.class, Timestamp.from(now));
        return age == null ? 0 : Math.max(0, age);
    }

    @Transactional
    public Optional<OutboxClaim> claim(Instant now, Instant expires) {
        // Recovery and claim are separate transitions; expired owners cannot complete after token changes.
        jdbc.update("""
            UPDATE outbox_message SET status='READY', next_attempt_at=?, claim_token=NULL,
              claim_expires_at=NULL, date_updated=?, version=version+1
            WHERE status='CLAIMED' AND claim_expires_at<=?
            """, Timestamp.from(now), Timestamp.from(now), Timestamp.from(now));
        UUID token = UUID.randomUUID();
        return jdbc.query("""
            WITH candidate AS (
              SELECT uuid FROM outbox_message WHERE status='READY' AND next_attempt_at<=?
              ORDER BY next_attempt_at,uuid FOR UPDATE SKIP LOCKED LIMIT 1
            )
            UPDATE outbox_message o SET status='CLAIMED', next_attempt_at=NULL, claim_token=?,
              claim_expires_at=?, publish_attempts=publish_attempts+1, version=version+1, date_updated=?
            FROM candidate c WHERE o.uuid=c.uuid RETURNING o.*
            """, (rs, row) -> new OutboxClaim(rs.getObject("uuid", UUID.class), rs.getObject("batch_uuid", UUID.class),
                rs.getObject("receivable_uuid", UUID.class), rs.getObject("request_uuid", UUID.class),
                rs.getObject("attempt_uuid", UUID.class), rs.getString("topic"), rs.getString("payload"),
                rs.getObject("claim_token", UUID.class), rs.getLong("version")),
            Timestamp.from(now), token, Timestamp.from(expires), Timestamp.from(now)).stream().findFirst();
    }

    @Transactional
    public boolean sent(OutboxClaim claim, Instant now) {
        return jdbc.update("""
            UPDATE outbox_message SET status='SENT', sent_at=?, claim_token=NULL,
              claim_expires_at=NULL, date_updated=?, version=version+1
            WHERE uuid=? AND status='CLAIMED' AND claim_token=? AND version=? AND claim_expires_at>?
            """, Timestamp.from(now), Timestamp.from(now), claim.uuid(), claim.token(), claim.version(), Timestamp.from(now)) == 1;
    }

    @Transactional
    public boolean retry(OutboxClaim claim, Instant now, Instant next) {
        return jdbc.update("""
            UPDATE outbox_message SET status='READY', next_attempt_at=?, claim_token=NULL,
              claim_expires_at=NULL, date_updated=?, version=version+1
            WHERE uuid=? AND status='CLAIMED' AND claim_token=? AND version=?
            """, Timestamp.from(next), Timestamp.from(now), claim.uuid(), claim.token(), claim.version()) == 1;
    }
}
