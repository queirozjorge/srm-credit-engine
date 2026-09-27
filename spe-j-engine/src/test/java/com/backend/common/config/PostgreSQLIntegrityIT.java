package com.backend.common.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class PostgreSQLIntegrityIT {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-trixie");
    static DriverManagerDataSource admin;
    static DriverManagerDataSource runtime;
    static Flyway flyway;

    @BeforeAll
    static void migrate() {
        admin = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        JdbcTemplate jdbc = new JdbcTemplate(admin);
        jdbc.execute("CREATE ROLE srm_engine LOGIN PASSWORD 'test'; CREATE ROLE srm_workflow LOGIN PASSWORD 'test'; CREATE ROLE srm_migrator LOGIN PASSWORD 'test'");
        jdbc.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO srm_migrator");
        flyway = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), "srm_migrator", "test")
            .placeholders(Map.of("engineRole","srm_engine","workflowRole","srm_workflow"))
            .cleanDisabled(true).load();
        flyway.migrate();
        runtime = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), "srm_engine", "test");
    }

    @Test
    void migrationsAreRepeatableWithoutReapplyingOrDeletingData() {
        assertEquals(0, flyway.migrate().migrationsExecuted);
        assertEquals(4, flyway.info().applied().length);
    }

    @Test
    void registrationCommitsTogetherAndGeneratedFlagCannotBeOverwritten() throws Exception {
        try (Connection connection=runtime.getConnection()) {
            connection.setAutoCommit(false);
            Fixture fixture=registration(connection);
            connection.commit();
            try (var result=connection.createStatement().executeQuery("SELECT status,has_error FROM receivable_processing WHERE receivable_uuid='"+fixture.receivable()+"'")) {
                assertTrue(result.next()); assertEquals("READY",result.getString(1)); assertFalse(result.getBoolean(2));
            }
            assertThrows(SQLException.class,()->connection.createStatement().executeUpdate("UPDATE receivable_processing SET has_error=true WHERE receivable_uuid='"+fixture.receivable()+"'"));
            connection.rollback();
        }
    }

    @Test
    void incompleteBatchFailsOnlyAtCommitAndRollsBack() throws Exception {
        try (Connection connection=runtime.getConnection()) {
            connection.setAutoCommit(false);
            UUID batch=UUID.randomUUID();
            connection.createStatement().executeUpdate(batchInsert(batch));
            assertThrows(SQLException.class,connection::commit);
            connection.rollback();
            assertEquals(0,new JdbcTemplate(admin).queryForObject("SELECT count(*) FROM batch WHERE uuid=?",Integer.class,batch));
        }
    }

    @Test
    void runtimeCannotChangeHistoryDeleteTruncateOrCreateTables() throws Exception {
        try (Connection connection=runtime.getConnection()) {
            connection.setAutoCommit(false);
            Fixture f=registration(connection); connection.commit();
            for(String sql: new String[]{"UPDATE receivable SET external_reference='changed' WHERE uuid='"+f.receivable()+"'",
                "DELETE FROM assignor", "TRUNCATE audit_event", "CREATE TABLE forbidden(uuid uuid)", "INSERT INTO settlement(uuid) VALUES(gen_random_uuid())"}) {
                assertThrows(SQLException.class,()->connection.createStatement().execute(sql)); connection.rollback();
            }
            assertThrows(SQLException.class,()->connection.createStatement().execute("UPDATE assignor SET document_number='12345678901234',version=version+1,date_updated=now() WHERE uuid='"+f.assignor()+"'"));
            connection.rollback();
        }
    }

    @Test
    void acceptanceNeedsTermsCommandAuditAndGlobalIdempotency() throws Exception {
        try(Connection connection=runtime.getConnection()) {
            connection.setAutoCommit(false); Fixture f=registration(connection); connection.commit();
            accepted(connection,f); connection.commit();
            assertEquals(1,new JdbcTemplate(admin).queryForObject("SELECT count(*) FROM outbox_message WHERE batch_uuid=?",Integer.class,f.batch()));
            assertThrows(SQLException.class,()->connection.createStatement().execute("UPDATE settlement_request SET request_fingerprint='changed',version=version+1,date_updated=now() WHERE uuid='"+f.request()+"'"));
            connection.rollback();
        }
    }

    @Test
    void staleVersionAndMissingAcceptanceChildrenRollback() throws Exception {
        try(Connection connection=runtime.getConnection()) {
            connection.setAutoCommit(false); Fixture f=registration(connection); connection.commit();
            assertThrows(SQLException.class,()->connection.createStatement().execute("UPDATE assignor SET name='Outro',date_updated=now() WHERE uuid='"+f.assignor()+"'"));
            connection.rollback();
            accepted(connection,f);
            connection.createStatement().execute("SET CONSTRAINTS ALL IMMEDIATE");
            connection.rollback();
            assertEquals("READY",new JdbcTemplate(admin).queryForObject("SELECT status FROM batch WHERE uuid=?",String.class,f.batch()));
        }
    }

    @Test
    void claimedOutboxRecoversWithNewTokenAndRejectsOldOwner() throws Exception {
        var repository=new com.backend.outbox.repository.OutboxRepository(new JdbcTemplate(runtime));
        var cleanupNow=java.time.Instant.now().plusSeconds(1);
        java.util.Optional<com.backend.outbox.model.OutboxClaim> existing;
        while ((existing=repository.claim(cleanupNow,cleanupNow.plusSeconds(60))).isPresent()) repository.sent(existing.get(),cleanupNow);
        Fixture f;
        try(Connection c=runtime.getConnection()) {
            c.setAutoCommit(false); f=registration(c); c.commit(); accepted(c,f); c.commit();
        }
        var now=java.time.Instant.now().plusSeconds(1);
        var first=repository.claim(now,now.plusSeconds(60)).orElseThrow();
        assertEquals(f.receivable(),first.receivableUuid());
        assertTrue(repository.claim(now,now.plusSeconds(60)).isEmpty());
        var next=repository.claim(now.plusSeconds(61),now.plusSeconds(121)).orElseThrow();
        assertNotEquals(first.token(),next.token());
        assertFalse(repository.sent(first,now.plusSeconds(62)));
        assertTrue(repository.sent(next,now.plusSeconds(62)));
        assertEquals(2,new JdbcTemplate(runtime).queryForObject("SELECT publish_attempts FROM outbox_message WHERE uuid=?",Integer.class,next.uuid()));
    }

    @Test
    void settlementRequiresTerminalStateAndSuccessAuditInSameTransaction() throws Exception {
        Fixture f;
        try(Connection c=runtime.getConnection()) {
            c.setAutoCommit(false); f=registration(c); c.commit(); accepted(c,f); c.commit();
        }
        var worker=new DriverManagerDataSource(POSTGRES.getJdbcUrl(),"srm_workflow","test");
        String result=UUID.randomUUID().toString();
        String insert="INSERT INTO settlement(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,terms_uuid,settled_at,present_value_brl,discount_brl,payment_amount,payment_currency,date_register) SELECT '"+result+"','"+f.batch()+"','"+f.request()+"','"+f.receivable()+"','"+f.attempt()+"',uuid,now(),100,0,100,'BRL',now() FROM receivable_terms WHERE attempt_uuid='"+f.attempt()+"'";
        try(Connection c=worker.getConnection()) {
            c.setAutoCommit(false); c.createStatement().execute(insert);
            assertThrows(SQLException.class,c::commit); c.rollback();
            assertEquals(0,new JdbcTemplate(runtime).queryForObject("SELECT count(*) FROM settlement WHERE receivable_uuid=?",Integer.class,f.receivable()));
            var statement=c.createStatement(); statement.execute(insert);
            statement.execute("UPDATE settlement_request_item SET status='SETTLED',completed_at=now(),version=version+1,date_updated=now() WHERE uuid='"+f.attempt()+"'");
            statement.execute("UPDATE receivable_processing SET status='SETTLED',version=version+1,date_updated=now() WHERE receivable_uuid='"+f.receivable()+"'");
            statement.execute("UPDATE settlement_request SET status='SETTLED',pending_count=0,settled_count=1,completed_at=now(),version=version+1,date_updated=now() WHERE uuid='"+f.request()+"'");
            statement.execute("UPDATE batch SET status='SETTLED',pending_count=0,settled_count=1,version=version+1,date_updated=now() WHERE uuid='"+f.batch()+"'");
            statement.execute("INSERT INTO audit_event(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,settlement_uuid,event_type,actor_issuer,actor_subject,correlation_id,details,date_register) VALUES(gen_random_uuid(),'"+f.batch()+"','"+f.request()+"','"+f.receivable()+"','"+f.attempt()+"','"+result+"','RECEIVABLE_SETTLED','worker','worker','test','{}',now())");
            c.commit();
            assertThrows(SQLException.class,()->statement.execute(insert)); c.rollback();
            assertThrows(SQLException.class,()->statement.execute("UPDATE settlement_request_item SET status='PENDING',completed_at=NULL,version=version+1,date_updated=now() WHERE uuid='"+f.attempt()+"'")); c.rollback();
        }
    }

    @Test
    void deferredQueueCannotBeEditedAndRechecksWritesAfterImmediateValidation() throws Exception {
        try(Connection c=runtime.getConnection()) {
            c.setAutoCommit(false); Fixture f=registration(c); accepted(c,f);
            c.createStatement().execute("SET CONSTRAINTS ALL IMMEDIATE");
            assertThrows(SQLException.class,()->c.createStatement().execute("UPDATE batch SET status='FAILED',pending_count=0,failed_count=1,version=version+1,date_updated=now() WHERE uuid='"+f.batch()+"'"));
            c.rollback();
            assertThrows(SQLException.class,()->c.createStatement().execute("DELETE FROM pending_integrity_check"));
            c.rollback();
        }
        assertEquals(0,new JdbcTemplate(admin).queryForObject("SELECT count(*) FROM pending_integrity_check",Integer.class));
    }

    @Test
    void projectionChangesWithoutMatchingTitleTransitionsCannotCommit() throws Exception {
        Fixture f;
        try(Connection c=runtime.getConnection()) {
            c.setAutoCommit(false); f=registration(c); c.commit(); accepted(c,f); c.commit();
            c.createStatement().execute("UPDATE batch SET status='FAILED',pending_count=0,failed_count=1,version=version+1,date_updated=now() WHERE uuid='"+f.batch()+"'");
            var error=assertThrows(SQLException.class,c::commit);
            assertEquals("23514",error.getSQLState()); c.rollback();
            c.createStatement().execute("UPDATE settlement_request SET status='FAILED',pending_count=0,failed_count=1,completed_at=now(),version=version+1,date_updated=now() WHERE uuid='"+f.request()+"'");
            error=assertThrows(SQLException.class,c::commit);
            assertEquals("23514",error.getSQLState()); c.rollback();
            assertEquals("PENDING",new JdbcTemplate(runtime).queryForObject("SELECT status FROM batch WHERE uuid=?",String.class,f.batch()));
        }
    }

    @Test
    void runtimeCannotForgeOrClearConservationDeltas() throws Exception {
        try(Connection c=runtime.getConnection()) {
            c.setAutoCommit(false);
            for(String sql:new String[]{
                "SELECT queue_projection_delta('batch',gen_random_uuid(),0::bigint,0::bigint,0::bigint,0::bigint,0::bigint)",
                "UPDATE pending_integrity_check SET pending_delta=0",
                "SELECT check_projection_delta('batch',gen_random_uuid())"}) {
                assertThrows(SQLException.class,()->c.createStatement().execute(sql));c.rollback();
            }
        }
    }

    @Test
    void repeatedHeaderUpdatesCoalesceAndRollbackLeavesNoPrivateDeltas() throws Exception {
        Fixture f;
        try(Connection c=runtime.getConnection()) {
            c.setAutoCommit(false);f=registration(c);c.commit();
            for(int i=0;i<5;i++) c.createStatement().execute("UPDATE batch SET version=version+1,date_updated=now() WHERE uuid='"+f.batch()+"'");
            c.commit();
            assertEquals(0,new JdbcTemplate(admin).queryForObject("SELECT count(*) FROM pending_integrity_check",Integer.class));
            accepted(c,f);c.rollback();
            assertEquals("READY",new JdbcTemplate(runtime).queryForObject("SELECT status FROM batch WHERE uuid=?",String.class,f.batch()));
            assertEquals(0,new JdbcTemplate(admin).queryForObject("SELECT count(*) FROM pending_integrity_check",Integer.class));
        }
    }

    static Fixture registration(Connection connection) throws SQLException {
        Fixture f=new Fixture(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID());
        String document=String.format("%014d",Math.abs(f.assignor().getMostSignificantBits()%100000000000000L));
        connection.createStatement().execute("INSERT INTO assignor(uuid,document_number,name,date_register) VALUES('"+f.assignor()+"','"+document+"','Cedente',now())");
        connection.createStatement().execute(batchInsert(f.batch()));
        connection.createStatement().execute("INSERT INTO receivable VALUES('"+f.receivable()+"','"+f.batch()+"','"+f.assignor()+"','ref','DUPLICATA_MERCANTIL',100,current_date,'BRL',now())");
        connection.createStatement().execute("INSERT INTO receivable_processing(uuid,receivable_uuid,status,attempt_number,date_register) VALUES(gen_random_uuid(),'"+f.receivable()+"','READY',0,now())");
        connection.createStatement().execute("INSERT INTO audit_event(uuid,batch_uuid,event_type,actor_issuer,actor_subject,correlation_id,details,date_register) VALUES(gen_random_uuid(),'"+f.batch()+"','BATCH_CREATED','issuer','operator','test','{}',now())");
        return f;
    }

    static String batchInsert(UUID id) {
        return "INSERT INTO batch(uuid,source,status,item_count,ready_count,pending_count,settled_count,failed_count,created_by_issuer,created_by_subject,date_register) VALUES('"+id+"','FORM','READY',1,1,0,0,0,'issuer','operator',now())";
    }

    static void accepted(Connection c,Fixture f) throws SQLException {
        var s=c.createStatement();
        s.execute("INSERT INTO settlement_request(uuid,batch_uuid,operation,kind,idempotency_key,request_fingerprint,status,item_count,pending_count,settled_count,failed_count,accepted_at,requested_by_issuer,requested_by_subject,calculation_date,term_convention,base_rate,rule_version,calculation_policy,rounding_policy,date_register) VALUES('"+f.request()+"','"+f.batch()+"','SETTLEMENT','INITIAL','"+f.request()+"','fingerprint','PENDING',1,1,0,0,now(),'issuer','operator',current_date,'ACTUAL_30',0.02,'1','DECIMAL_50','HALF_EVEN',now())");
        s.execute("INSERT INTO settlement_request_item(uuid,request_uuid,receivable_uuid,attempt_number,status,date_register) VALUES('"+f.attempt()+"','"+f.request()+"','"+f.receivable()+"',1,'PENDING',now())");
        s.execute("INSERT INTO receivable_terms VALUES(gen_random_uuid(),'"+f.attempt()+"',0,0.01,now())");
        s.execute("INSERT INTO outbox_message(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,topic,status,payload,next_attempt_at,date_register) VALUES(gen_random_uuid(),'"+f.batch()+"','"+f.request()+"','"+f.receivable()+"','"+f.attempt()+"','credit-receivable','READY',jsonb_build_object('batchUuid','"+f.batch()+"','receivableUuid','"+f.receivable()+"','requestUuid','"+f.request()+"','idempotencyKey','"+f.request()+"'),now(),now())");
        s.execute("UPDATE receivable_processing SET active_attempt_uuid='"+f.attempt()+"',status='PENDING',attempt_number=1,version=version+1,date_updated=now() WHERE receivable_uuid='"+f.receivable()+"'");
        s.execute("UPDATE batch SET active_request_uuid='"+f.request()+"',status='PENDING',ready_count=0,pending_count=1,version=version+1,date_updated=now() WHERE uuid='"+f.batch()+"'");
        s.execute("INSERT INTO audit_event(uuid,batch_uuid,request_uuid,event_type,actor_issuer,actor_subject,correlation_id,details,date_register) VALUES(gen_random_uuid(),'"+f.batch()+"','"+f.request()+"','SETTLEMENT_REQUESTED','issuer','operator','test','{}',now())");
        s.execute("INSERT INTO audit_event(uuid,batch_uuid,request_uuid,receivable_uuid,attempt_uuid,event_type,actor_issuer,actor_subject,correlation_id,details,date_register) VALUES(gen_random_uuid(),'"+f.batch()+"','"+f.request()+"','"+f.receivable()+"','"+f.attempt()+"','RECEIVABLE_ATTEMPT_ACCEPTED','issuer','operator','test','{}',now())");
    }
    record Fixture(UUID assignor,UUID batch,UUID receivable,UUID request,UUID attempt) { }
}
