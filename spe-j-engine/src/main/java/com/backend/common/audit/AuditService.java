package com.backend.common.audit;

import com.backend.common.security.ActorProvider;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AuditService {
  private final JdbcTemplate jdbc;
  private final ActorProvider actors;
  private final JsonMapper json;
  private final Clock clock;
  private final AuditValidator validator;

  public AuditService(
      JdbcTemplate jdbc,
      ActorProvider actors,
      JsonMapper json,
      Clock clock,
      AuditValidator validator) {
    this.jdbc = jdbc;
    this.actors = actors;
    this.json = json;
    this.clock = clock;
    this.validator = validator;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void record(String eventType, Map<String, UUID> references, Map<String, Object> details) {
    validator.validate(eventType, references, details);
    var actor = actors.current();
    String correlation = MDC.get("correlationId");
    if (correlation == null) correlation = UUID.randomUUID().toString();
    jdbc.update(
        """
INSERT INTO audit_event (uuid,event_type,actor_issuer,actor_subject,actor_display_name,correlation_id,details,date_register,
batch_uuid,request_uuid,receivable_uuid,attempt_uuid,settlement_uuid,assignor_uuid,proposal_uuid,exchange_rate_uuid)
VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?,?,?,?,?,?,?,?,?)
""",
        UUID.randomUUID(),
        eventType,
        actor.issuer(),
        actor.subject(),
        actor.displayName(),
        correlation,
        json.writeValueAsString(details),
        Timestamp.from(clock.instant()),
        references.get("batch_uuid"),
        references.get("request_uuid"),
        references.get("receivable_uuid"),
        references.get("attempt_uuid"),
        references.get("settlement_uuid"),
        references.get("assignor_uuid"),
        references.get("proposal_uuid"),
        references.get("exchange_rate_uuid"));
  }
}
