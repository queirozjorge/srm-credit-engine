package com.backend.common.audit;

import com.backend.settlement.model.AttemptContext;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class WorkerAuditRepository {
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    public WorkerAuditRepository(JdbcTemplate jdbc, JsonMapper json) { this.jdbc=jdbc; this.json=json; }

    public void success(AttemptContext context, UUID settlement, Instant now) {
        record(context,"RECEIVABLE_SETTLED",settlement,null,
                Map.of("settlementUuid",settlement.toString(),"termsUuid",context.termsUuid().toString()),now);
    }
    public void failedExecution(AttemptContext context, String code, String message, Instant now) {
        record(context,"RECEIVABLE_PROCESSING_ATTEMPT_FAILED",null,context.retryCount(),
                Map.of("retryNumber",context.retryCount(),"code",code,"message",message,"occurredAt",now.toString()),now);
    }
    public void retry(AttemptContext context, String code, String message, Instant due, Instant now) {
        record(context,"RECEIVABLE_PROCESSING_RETRY_SCHEDULED",null,context.retryCount()+1,
                Map.of("retryNumber",context.retryCount()+1,"nextRetryAt",due.toString(),"code",code,"message",message),now);
    }
    public void terminalFailure(AttemptContext context, String code, String message, Instant now) {
        record(context,"RECEIVABLE_SETTLEMENT_FAILED",null,null,
                Map.of("failure",Map.of("code",code,"message",message,"stage","PROCESSING","occurredAt",now.toString()),
                        "retryCount",context.retryCount(),"dlqTopic","credit-receivable.dlq"),now);
    }
    private void record(AttemptContext context, String type, UUID settlement, Integer retry, Map<String,Object> details, Instant now) {
        var command=context.command();
        jdbc.update("""
            INSERT INTO audit_event(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,settlement_uuid,retry_number,
                event_type,actor_issuer,actor_subject,correlation_id,details,date_register)
            VALUES(?,?,?,?,?,?,?,?,'urn:srm-credit:service','spe-j-workflow',?,CAST(? AS jsonb),?)
            """,UUID.randomUUID(),command.batchUuid(),command.requestUuid(),command.receivableUuid(),context.attemptUuid(),
                settlement,retry,type,context.correlationId(),json.writeValueAsString(details),Timestamp.from(now));
    }
}
