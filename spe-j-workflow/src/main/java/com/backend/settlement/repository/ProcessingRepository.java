package com.backend.settlement.repository;

import com.backend.settlement.model.AttemptContext;
import com.backend.settlement.model.FinancialResult;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProcessingRepository {
    private final JdbcTemplate jdbc;
    public ProcessingRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void complete(AttemptContext context, boolean success, String code, String message, Instant now) {
        var command = context.command();
        int settled = success ? 1 : 0;
        int failed = success ? 0 : 1;
        // Consistent lock order and expected versions avoid lost aggregate updates across titles.
        checked(jdbc.update("""
            UPDATE batch SET pending_count=pending_count-1,settled_count=settled_count+?,failed_count=failed_count+?,
                status=CASE WHEN pending_count>1 THEN 'PENDING' WHEN settled_count+?=item_count THEN 'SETTLED'
                    WHEN failed_count+?=item_count THEN 'FAILED' ELSE 'PARTIALLY_SETTLED' END,
                version=version+1,date_updated=?
            WHERE uuid=? AND active_request_uuid=? AND version=? AND status='PENDING'
            """,settled,failed,settled,failed,Timestamp.from(now),command.batchUuid(),command.requestUuid(),context.batchVersion()));
        checked(jdbc.update("""
            UPDATE settlement_request SET pending_count=pending_count-1,settled_count=settled_count+?,failed_count=failed_count+?,
                status=CASE WHEN pending_count>1 THEN 'PENDING' WHEN settled_count+?=item_count THEN 'SETTLED'
                    WHEN failed_count+?=item_count THEN 'FAILED' ELSE 'PARTIALLY_SETTLED' END,
                completed_at=CASE WHEN pending_count=1 THEN CAST(? AS timestamptz) ELSE NULL END,version=version+1,date_updated=?
            WHERE uuid=? AND version=? AND status='PENDING'
            """,settled,failed,settled,failed,Timestamp.from(now),Timestamp.from(now),command.requestUuid(),context.requestVersion()));
        String status = success ? "SETTLED" : "FAILED";
        checked(jdbc.update("""
            UPDATE receivable_processing SET status=?,version=version+1,date_updated=?
            WHERE receivable_uuid=? AND active_attempt_uuid=? AND version=? AND status='PENDING'
            """,status,Timestamp.from(now),command.receivableUuid(),context.attemptUuid(),context.processingVersion()));
        checked(jdbc.update("""
            UPDATE settlement_request_item SET status=?,completed_at=?,next_retry_at=NULL,failure_code=?,failure_message=?,
                failure_stage=?,failure_occurred_at=?,version=version+1,date_updated=?
            WHERE uuid=? AND version=? AND status='PENDING'
            """,status,Timestamp.from(now),code,message,success?null:"PROCESSING",success?null:Timestamp.from(now),
                Timestamp.from(now),context.attemptUuid(),context.attemptVersion()));
    }

    public UUID settle(AttemptContext context, FinancialResult result, Instant now) {
        var id = UUID.randomUUID();
        var command = context.command();
        jdbc.update("""
            INSERT INTO settlement(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,terms_uuid,settled_at,
                present_value_brl,discount_brl,payment_amount,payment_currency,date_register)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            """,id,command.batchUuid(),command.requestUuid(),command.receivableUuid(),context.attemptUuid(),context.termsUuid(),
                Timestamp.from(now),result.presentValueBrl(),result.discountBrl(),result.paymentValue(),
                context.snapshot().paymentCurrency(),Timestamp.from(now));
        return id;
    }

    public void reserveRetry(AttemptContext context, Instant due, Instant now) {
        checked(jdbc.update("""
            UPDATE settlement_request_item a SET retry_count=retry_count+1,next_retry_at=?,version=version+1,date_updated=?
            WHERE uuid=? AND version=? AND status='PENDING' AND retry_count<3
                AND EXISTS(SELECT 1 FROM receivable_processing p WHERE p.active_attempt_uuid=a.uuid AND p.status='PENDING')
            """,Timestamp.from(due),Timestamp.from(now),context.attemptUuid(),context.attemptVersion()));
    }

    public void deadLetter(AttemptContext context, Instant now) {
        var command=context.command();
        jdbc.update("""
            INSERT INTO outbox_message(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,topic,status,payload,next_attempt_at,date_register)
            VALUES(?,?,?,?,?,'credit-receivable.dlq','READY',jsonb_build_object(
                'batchUuid',CAST(? AS text),'receivableUuid',CAST(? AS text),'requestUuid',CAST(? AS text),'idempotencyKey',CAST(? AS text)),?,?)
            """,UUID.randomUUID(),command.batchUuid(),command.requestUuid(),command.receivableUuid(),context.attemptUuid(),
                command.batchUuid().toString(),command.receivableUuid().toString(),command.requestUuid().toString(),
                command.idempotencyKey(),Timestamp.from(now),Timestamp.from(now));
    }
    private void checked(int changed) {
        if(changed!=1) throw new OptimisticLockingFailureException("O estado mudou durante o processamento do título.");
    }
}
