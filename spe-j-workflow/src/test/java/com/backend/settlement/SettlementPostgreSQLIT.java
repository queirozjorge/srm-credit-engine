package com.backend.settlement;

import com.backend.common.audit.WorkerAuditRepository;
import com.backend.common.pricing.PricingEngine;
import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.repository.AttemptRepository;
import com.backend.settlement.repository.ProcessingRepository;
import com.backend.settlement.repository.SettlementQuarantineRepository;
import com.backend.settlement.model.SettlementQuarantineEntry;
import com.backend.settlement.model.AttemptContext;
import com.backend.settlement.service.impl.SettlementMetrics;
import com.backend.settlement.service.impl.SettlementQuarantineServiceImpl;
import com.backend.settlement.service.impl.SettlementServiceImpl;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@Testcontainers
class SettlementPostgreSQLIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer("postgres:17.11-trixie");
    static JdbcTemplate jdbc;
    static JdbcTransactionManager manager;
    final MutableClock clock=new MutableClock();
    @BeforeAll static void schema() throws Exception {
        var datasource=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
        jdbc=new JdbcTemplate(datasource);manager=new JdbcTransactionManager(datasource);
        jdbc.execute("CREATE ROLE srm_engine; CREATE ROLE srm_workflow");
        // Contract fixture uses the sole schema owner's migrations, never application source code.
        var migrations=Path.of(System.getProperty("basedir"),"..","spe-j-engine","src","main","resources","db","migration");
        jdbc.execute(Files.readString(migrations.resolve("V1__financial_schema.sql")));
        jdbc.execute(Files.readString(migrations.resolve("V2__transactional_integrity.sql")));
        jdbc.execute(Files.readString(migrations.resolve("V6__settlement_consumer_quarantine.sql"))
                .replace("${engineRole}","srm_engine").replace("${workflowRole}","srm_workflow"));
    }
    private SettlementServiceImpl service(PricingEngine pricing) {
        return service(pricing,new WorkerAuditRepository(jdbc,JsonMapper.builder().build()));
    }
    private SettlementServiceImpl service(PricingEngine pricing,WorkerAuditRepository audit) {
        return new SettlementServiceImpl(new AttemptRepository(jdbc),new ProcessingRepository(jdbc),audit,pricing,
                clock,new SettlementMetrics(new SimpleMeterRegistry()),manager);
    }
    private SettlementQuarantineServiceImpl quarantineService() {
        return new SettlementQuarantineServiceImpl(new SettlementQuarantineRepository(jdbc),manager);
    }

    @Test void quarantineIsIdempotentByTopicPartitionOffsetAndRejectsChangedFingerprint() {
        var service=quarantineService();
        var first=new SettlementQuarantineEntry("credit-receivable",0,17,"a".repeat(64),12,
                "b".repeat(64),10,"COMANDO_MALFORMADO");
        service.quarantine(first);
        service.quarantine(first);
        service.quarantine(new SettlementQuarantineEntry("credit-receivable",1,17,"a".repeat(64),12,
                "b".repeat(64),10,"COMANDO_MALFORMADO"));
        service.quarantine(new SettlementQuarantineEntry("credit-receivable",0,18,"a".repeat(64),12,
                "b".repeat(64),10,"COMANDO_MALFORMADO"));

        assertEquals(3,jdbc.queryForObject("select count(*) from settlement_consumer_quarantine",Integer.class));
        assertThrows(IllegalStateException.class,() -> service.quarantine(new SettlementQuarantineEntry(
                "credit-receivable",0,17,"c".repeat(64),12,"b".repeat(64),10,"COMANDO_MALFORMADO")));
        assertEquals("a".repeat(64),jdbc.queryForObject("select key_sha256 from settlement_consumer_quarantine where source_partition=0 and source_offset=17",String.class).trim());
        assertEquals(3,jdbc.queryForObject("select count(*) from settlement_consumer_quarantine",Integer.class));
    }
    @Test void commitsIndividualResultsAndReplaysWithoutDuplicatingSuccess() {
        var commands=fixture(2,"1");var service=service(new PricingEngine());
        assertTrue(service.process(commands.getFirst()).acknowledged());
        assertEquals("PENDING",jdbc.queryForObject("select status from batch where uuid=?",String.class,commands.getFirst().batchUuid()));
        assertTrue(service.process(commands.getFirst()).acknowledged());
        assertTrue(service.process(commands.get(1)).acknowledged());
        assertEquals(2,count("settlement",commands.getFirst().batchUuid()));
        assertEquals(2,jdbc.queryForObject("select count(*) from audit_event where batch_uuid=? and event_type='RECEIVABLE_SETTLED'",Integer.class,commands.getFirst().batchUuid()));
        assertEquals("SETTLED",jdbc.queryForObject("select status from batch where uuid=?",String.class,commands.getFirst().batchUuid()));
    }
    @Test void rollbackAfterFinancialInsertPreservesOtherTitlesAndRetriesWithDurableBudget() {
        var commands=fixture(2,"1");var healthy=service(new PricingEngine());
        assertTrue(healthy.process(commands.getFirst()).acknowledged());
        var audit=spy(new WorkerAuditRepository(jdbc,JsonMapper.builder().build()));
        doThrow(new TransientDataAccessResourceException("Falha induzida após resultado.")).when(audit).success(any(),any(),any());
        assertFalse(service(new PricingEngine(),audit).process(commands.get(1)).acknowledged());
        assertEquals(1,count("settlement",commands.getFirst().batchUuid()));
        assertEquals(1,jdbc.queryForObject("select retry_count from settlement_request_item where receivable_uuid=?",Integer.class,commands.get(1).receivableUuid()));
        // A newly constructed service resumes the reserved retry, retaining accepted conditions.
        clock.advance(2);
        assertTrue(service(new PricingEngine()).process(commands.get(1)).acknowledged());
        assertEquals(2,count("settlement",commands.getFirst().batchUuid()));
    }
    @Test void exhaustsExactlyThreeRetriesAndPersistsOneDeadLetter() {
        var command=fixture(1,"1").getFirst();var pricing=mock(PricingEngine.class);
        when(pricing.calculate(any())).thenThrow(new TransientDataAccessResourceException("Falha transitória induzida."));
        var service=service(pricing);
        for(int ordinal=1;ordinal<=3;ordinal++) {
            assertFalse(service.process(command).acknowledged());
            assertEquals(ordinal,jdbc.queryForObject("select retry_count from settlement_request_item where receivable_uuid=?",Integer.class,command.receivableUuid()));
            // Immediate delivery cannot create another reservation or consume the scheduled retry.
            assertFalse(service.process(command).acknowledged());
            verify(pricing,times(ordinal)).calculate(any());
            clock.advance(new long[]{1,5,15}[ordinal-1]);
        }
        assertTrue(service.process(command).acknowledged());
        assertTrue(service.process(command).acknowledged());
        verify(pricing,times(4)).calculate(any());
        assertEquals(0,count("settlement",command.batchUuid()));
        assertEquals(1,jdbc.queryForObject("select count(*) from outbox_message where batch_uuid=? and topic='credit-receivable.dlq'",Integer.class,command.batchUuid()));
        assertEquals(4,jdbc.queryForObject("select count(*) from audit_event where batch_uuid=? and event_type='RECEIVABLE_PROCESSING_ATTEMPT_FAILED'",Integer.class,command.batchUuid()));
        assertEquals("FAILED",jdbc.queryForObject("select status from batch where uuid=?",String.class,command.batchUuid()));
    }
    @Test void concurrentWorkersPreserveCountsAndSingleSettlementPerTitle() throws Exception {
        var commands=fixture(12,"1");
        try(var executor=Executors.newFixedThreadPool(3)) {
            var futures=new ArrayList<Future<?>>();
            for(var command:commands) for(int duplicate=0;duplicate<2;duplicate++) futures.add(executor.submit(() -> {
                var service=service(new PricingEngine());
                for(int attempt=0;attempt<100;attempt++) if(service.process(command).acknowledged()) return;
                fail("Não convergiu após disputa de versões.");
            }));
            for(var future:futures) future.get(30,TimeUnit.SECONDS);
        }
        assertEquals(12,count("settlement",commands.getFirst().batchUuid()));
        assertEquals(12,jdbc.queryForObject("select settled_count from batch where uuid=?",Integer.class,commands.getFirst().batchUuid()));
        assertEquals(0,jdbc.queryForObject("select sum(retry_count) from settlement_request_item where request_uuid=?",Integer.class,commands.getFirst().requestUuid()));
    }
    @Test void unsupportedRuleFailsWithoutAutomaticRetry() {
        var command=fixture(1,"unsupported").getFirst();
        assertTrue(service(new PricingEngine()).process(command).acknowledged());
        assertEquals("REGRA_NAO_SUPORTADA",jdbc.queryForObject("select failure_code from settlement_request_item where receivable_uuid=?",String.class,command.receivableUuid()));
        assertEquals(0,jdbc.queryForObject("select retry_count from settlement_request_item where receivable_uuid=?",Integer.class,command.receivableUuid()));
    }
    @Test void missingAcceptedSnapshotIsPersistedAsTerminalFinancialFailure() {
        var command=fixture(1,"1").getFirst();
        var delegate=new AttemptRepository(jdbc);
        var missingSnapshot=new AttemptRepository(jdbc) {
            @Override public AttemptContext find(SettlementCommand requested) {
                var context=delegate.find(requested);
                return new AttemptContext(context.command(),context.attemptUuid(),context.activeAttemptUuid(),context.termsUuid(),
                        context.status(),context.retryCount(),context.nextRetryAt(),context.attemptVersion(),
                        context.processingVersion(),context.batchVersion(),context.requestVersion(),context.correlationId(),null);
            }
        };
        var service=new SettlementServiceImpl(missingSnapshot,new ProcessingRepository(jdbc),
                new WorkerAuditRepository(jdbc,JsonMapper.builder().build()),new PricingEngine(),clock,
                new SettlementMetrics(new SimpleMeterRegistry()),manager);

        assertTrue(service.process(command).acknowledged());
        assertEquals("FAILED",jdbc.queryForObject("select status from settlement_request_item where receivable_uuid=?",String.class,command.receivableUuid()));
        assertEquals("CONDICOES_FIXADAS_AUSENTES",jdbc.queryForObject("select failure_code from settlement_request_item where receivable_uuid=?",String.class,command.receivableUuid()));
        assertEquals("PROCESSING",jdbc.queryForObject("select failure_stage from settlement_request_item where receivable_uuid=?",String.class,command.receivableUuid()));
        assertEquals(1,jdbc.queryForObject("select count(*) from outbox_message where batch_uuid=? and topic='credit-receivable.dlq'",Integer.class,command.batchUuid()));
        assertEquals(0,count("settlement",command.batchUuid()));
    }
    private int count(String table,UUID batch) { return jdbc.queryForObject("select count(*) from "+table+" where batch_uuid=?",Integer.class,batch); }
    private List<SettlementCommand> fixture(int size,String rule) {
        return new TransactionTemplate(manager).execute(status -> {
            UUID batch=UUID.randomUUID(),request=UUID.randomUUID(),assignor=UUID.randomUUID();
            var now=Timestamp.from(clock.instant());var commands=new ArrayList<SettlementCommand>();
            jdbc.update("insert into assignor(uuid,document_number,name,date_register) values(?,?,?,?)",assignor,String.format("%014d",Math.floorMod(assignor.getMostSignificantBits(),100000000000000L)),"Cedente de teste",now);
            jdbc.update("insert into batch(uuid,active_request_uuid,source,status,item_count,ready_count,pending_count,settled_count,failed_count,created_by_issuer,created_by_subject,date_register) values(?,?,'CSV','PENDING',?,0,?,0,0,'issuer','operator',?)",batch,request,size,size,now);
            jdbc.update("""
                insert into settlement_request(uuid,batch_uuid,operation,kind,idempotency_key,request_fingerprint,status,item_count,pending_count,settled_count,failed_count,
                accepted_at,requested_by_issuer,requested_by_subject,calculation_date,term_convention,base_rate,rule_version,calculation_policy,rounding_policy,date_register)
                values(?,?,'SETTLEMENT','INITIAL',?,'fingerprint','PENDING',?,?,0,0,?,'issuer','operator',?,'ACTUAL_30',0.01,?,'DECIMAL_50','HALF_EVEN',?)
                """,request,batch,request.toString(),size,size,now,LocalDate.ofInstant(clock.instant(),ZoneId.of("America/Sao_Paulo")),rule,now);
            audit(batch,null,null,null,"BATCH_CREATED",now);audit(batch,request,null,null,"SETTLEMENT_REQUESTED",now);
            for(int n=0;n<size;n++) {
                UUID title=UUID.randomUUID(),attempt=UUID.randomUUID();
                jdbc.update("insert into receivable(uuid,batch_uuid,assignor_uuid,external_reference,type,face_value_brl,due_date,payment_currency,date_register) values(?,?,?,?,'DUPLICATA_MERCANTIL',1000.00,?,'BRL',?)",title,batch,assignor,"T"+n,LocalDate.ofInstant(clock.instant(),ZoneId.of("America/Sao_Paulo")).plusDays(90),now);
                jdbc.update("insert into settlement_request_item(uuid,request_uuid,receivable_uuid,attempt_number,status,date_register) values(?,?,?,1,'PENDING',?)",attempt,request,title,now);
                jdbc.update("insert into receivable_processing(uuid,receivable_uuid,active_attempt_uuid,status,attempt_number,date_register) values(?,?,?,'PENDING',1,?)",UUID.randomUUID(),title,attempt,now);
                jdbc.update("insert into receivable_terms(uuid,attempt_uuid,term_days,spread,date_register) values(?,?,90,0.015,?)",UUID.randomUUID(),attempt,now);
                var command=new SettlementCommand(batch,title,request,request.toString());commands.add(command);
                jdbc.update("insert into outbox_message(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,topic,status,payload,next_attempt_at,date_register) values(?,?,?,?,?,'credit-receivable','READY',cast(? as jsonb),?,?)",UUID.randomUUID(),batch,request,title,attempt,JsonMapper.builder().build().writeValueAsString(command),now,now);
                audit(batch,request,title,attempt,"RECEIVABLE_ATTEMPT_ACCEPTED",now);
            }
            return commands;
        });
    }
    private void audit(UUID batch,UUID request,UUID title,UUID attempt,String event,Timestamp now) {
        jdbc.update("insert into audit_event(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,event_type,actor_issuer,actor_subject,correlation_id,details,date_register) values(?,?,?,?,?,?,'issuer','operator',?,'{}',?)",UUID.randomUUID(),batch,request,title,attempt,event,batch.toString(),now);
    }
    static class MutableClock extends Clock {
        private Instant now=Instant.parse("2026-09-27T15:00:00Z");
        void advance(long seconds) { now=now.plusSeconds(seconds); }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
}
