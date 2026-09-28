package com.backend.settlement.service.impl;

import com.backend.common.audit.WorkerAuditRepository;
import com.backend.common.pricing.PricingEngine;
import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.exceptions.FinancialProcessingException;
import com.backend.settlement.exceptions.InvalidCommandException;
import com.backend.settlement.model.AttemptContext;
import com.backend.settlement.model.ProcessingOutcome;
import com.backend.settlement.repository.AttemptRepository;
import com.backend.settlement.repository.ProcessingRepository;
import com.backend.settlement.service.ISettlementService;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.RecoverableDataAccessException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class SettlementServiceImpl implements ISettlementService {
    private static final Logger LOG=LoggerFactory.getLogger(SettlementServiceImpl.class);
    private static final long[] RETRY_SECONDS={1,5,15};
    private final AttemptRepository attempts;
    private final ProcessingRepository processing;
    private final WorkerAuditRepository audit;
    private final PricingEngine pricing;
    private final Clock clock;
    private final SettlementMetrics metrics;
    private final TransactionTemplate transaction;

    public SettlementServiceImpl(AttemptRepository attempts, ProcessingRepository processing, WorkerAuditRepository audit,
            PricingEngine pricing, Clock clock, SettlementMetrics metrics, PlatformTransactionManager manager) {
        this.attempts=attempts;this.processing=processing;this.audit=audit;this.pricing=pricing;this.clock=clock;this.metrics=metrics;
        this.transaction=new TransactionTemplate(manager);
        this.transaction.setTimeout(30);
    }

    @Override
    public ProcessingOutcome process(SettlementCommand command) {
        long start=System.nanoTime();
        try {
            for(int conflicts=0;conflicts<8;conflicts++) {
                var loaded=new AtomicReference<AttemptContext>();
                try {
                    var outcome=transaction.execute(status -> {
                        var context=attempts.find(command);
                        loaded.set(context);
                        if(context.terminalOrObsolete()) return ProcessingOutcome.complete();
                        var now=clock.instant();
                        if(context.nextRetryAt()!=null && context.nextRetryAt().isAfter(now))
                            return ProcessingOutcome.retry(Duration.between(now,context.nextRetryAt()));
                        if(context.snapshot()==null) throw new FinancialProcessingException(
                                "CONDICOES_FIXADAS_AUSENTES", "A tentativa não possui condições financeiras fixadas.");
                        var result=pricing.calculate(context.snapshot());
                        processing.complete(context,true,null,null,now);
                        var settlement=processing.settle(context,result,now);
                        audit.success(context,settlement,now);
                        return ProcessingOutcome.complete();
                    });
                    if(outcome.acknowledged()) metrics.outcome(loaded.get().terminalOrObsolete()?"duplicate":"settled");
                    return outcome;
                } catch(RuntimeException error) {
                    if(concurrency(error)) {
                        metrics.outcome("concurrency");
                        continue;
                    }
                    if(error instanceof InvalidCommandException || loaded.get()==null) throw error;
                    if(!(error instanceof FinancialProcessingException) && !(error instanceof DataAccessException)) throw error;
                    var outcome=recordFailure(loaded.get(),error);
                    if(outcome!=null) {
                        metrics.outcome(outcome.acknowledged()?"failed":"retry");
                        return outcome;
                    }
                }
            }
            return ProcessingOutcome.retry(Duration.ofMillis(100));
        } finally { metrics.duration(System.nanoTime()-start); }
    }

    private ProcessingOutcome recordFailure(AttemptContext failed, RuntimeException error) {
        String code=error instanceof FinancialProcessingException financial?financial.code():"FALHA_PROCESSAMENTO";
        String message=error instanceof FinancialProcessingException?error.getMessage():"Não foi possível processar o título.";
        logFailure(failed,code,message,error);
        try {
            return transaction.execute(status -> {
                var current=attempts.find(failed.command());
                if(current.terminalOrObsolete()) return ProcessingOutcome.complete();
                // A concurrent result or retry reservation owns the new version; never spend its budget.
                if(current.attemptVersion()!=failed.attemptVersion()) return ProcessingOutcome.retry(Duration.ofMillis(100));
                var now=clock.instant();
                audit.failedExecution(current,code,message,now);
                if(transientFailure(error) && current.retryCount()<RETRY_SECONDS.length) {
                    var due=now.plusSeconds(RETRY_SECONDS[current.retryCount()]);
                    processing.reserveRetry(current,due,now);
                    audit.retry(current,code,message,due,now);
                    return ProcessingOutcome.retry(Duration.between(now,due));
                }
                processing.complete(current,false,code,message,now);
                processing.deadLetter(current,now);
                audit.terminalFailure(current,code,message,now);
                return ProcessingOutcome.complete();
            });
        } catch(RuntimeException persistenceError) {
            if(concurrency(persistenceError)) return null;
            // Without a confirmed result or durable failure the listener must retain the offset.
            persistenceError.addSuppressed(error);
            throw persistenceError;
        }
    }

    private boolean transientFailure(RuntimeException error) {
        return error instanceof TransientDataAccessException || error instanceof DataAccessResourceFailureException
                || error instanceof RecoverableDataAccessException;
    }

    private boolean concurrency(Throwable error) {
        if(error instanceof OptimisticLockingFailureException) return true;
        for(Throwable cause=error;cause!=null;cause=cause.getCause())
            if(cause instanceof SQLException sql && ("23505".equals(sql.getSQLState()) || "40001".equals(sql.getSQLState()) || "40P01".equals(sql.getSQLState()))) return true;
        return false;
    }
    private void logFailure(AttemptContext context,String code,String message,RuntimeException error) {
        LOG.atError().addKeyValue("code",code).addKeyValue("operation","SETTLEMENT")
                .addKeyValue("batchUuid",context.command().batchUuid()).addKeyValue("receivableUuid",context.command().receivableUuid())
                .addKeyValue("requestUuid",context.command().requestUuid()).addKeyValue("attemptUuid",context.attemptUuid())
                .addKeyValue("correlationId",context.correlationId()).setCause(error)
                .log("[handler]:[error]: {} - {}",code,message);
    }
}
