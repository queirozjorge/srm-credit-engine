package com.backend.common.config;

import java.sql.Connection;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.junit.jupiter.api.Assertions.*;

/** Deterministic work comparison: row reads, not a flaky wall-clock SLA assertion. */
@Testcontainers
class ProjectionIntegrityPerformanceIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer("postgres:17.11-trixie");

    @Test
    void versionFourRemovesPerCommitRecountsOfOneThousandTitles() throws Exception {
        DataSource admin=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
        var jdbc=new JdbcTemplate(admin);
        jdbc.execute("CREATE ROLE srm_engine LOGIN PASSWORD 'test'; CREATE ROLE srm_workflow LOGIN PASSWORD 'test'; CREATE ROLE srm_migrator LOGIN PASSWORD 'test'");
        jdbc.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO srm_migrator");
        var settings=Map.of("engineRole","srm_engine","workflowRole","srm_workflow");
        Flyway.configure().dataSource(DB.getJdbcUrl(),"srm_migrator","test").placeholders(settings).target("3").load().migrate();
        DataSource runtime=new DriverManagerDataSource(DB.getJdbcUrl(),"srm_engine","test");
        UUID batch=seedThousand(runtime);
        Measurement baseline=measure(runtime,batch,100);
        Flyway.configure().dataSource(DB.getJdbcUrl(),"srm_migrator","test").placeholders(settings).load().migrate();
        assertEquals(1000,jdbc.queryForObject("SELECT item_count FROM batch WHERE uuid=?",Integer.class,batch));
        Measurement incremental=measure(runtime,batch,100);
        System.out.printf("PROJECTION_BENCHMARK titles=1000 commits=100 baselineRows=%d incrementalRows=%d baselineMs=%.2f incrementalMs=%.2f%n",
                baseline.rows(),incremental.rows(),baseline.nanos()/1_000_000d,incremental.nanos()/1_000_000d);
        assertTrue(baseline.rows()>=100_000,"Baseline deve demonstrar varreduras dos títulos.");
        assertTrue(incremental.rows()<baseline.rows()/10,"A atualização deve eliminar pelo menos 90% das leituras dos títulos.");
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM pending_integrity_check",Integer.class));
        assertEquals(1000,jdbc.queryForObject("SELECT count(*) FROM receivable WHERE batch_uuid=?",Integer.class,batch));
    }

    private UUID seedThousand(DataSource runtime) throws Exception {
        UUID batch=UUID.randomUUID(),assignor=UUID.randomUUID();
        try(Connection c=runtime.getConnection()) {
            c.setAutoCommit(false);var s=c.createStatement();
            s.execute("INSERT INTO assignor(uuid,document_number,name,date_register) VALUES('"+assignor+"','00000000000001','Cedente de carga',now())");
            s.execute("INSERT INTO batch(uuid,source,status,item_count,ready_count,pending_count,settled_count,failed_count,created_by_issuer,created_by_subject,date_register) VALUES('"+batch+"','CSV','READY',1000,1000,0,0,0,'test','operator',now())");
            s.execute("INSERT INTO receivable(uuid,batch_uuid,assignor_uuid,external_reference,type,face_value_brl,due_date,payment_currency,date_register) SELECT gen_random_uuid(),'"+batch+"','"+assignor+"',n::text,'DUPLICATA_MERCANTIL',100,current_date+30,'BRL',now() FROM generate_series(1,1000) n");
            s.execute("INSERT INTO receivable_processing(uuid,receivable_uuid,status,attempt_number,date_register) SELECT gen_random_uuid(),uuid,'READY',0,now() FROM receivable WHERE batch_uuid='"+batch+"'");
            s.execute("INSERT INTO audit_event(uuid,batch_uuid,event_type,actor_issuer,actor_subject,correlation_id,details,date_register) VALUES(gen_random_uuid(),'"+batch+"','BATCH_CREATED','test','operator','test','{}',now())");
            c.commit();
        }
        return batch;
    }

    private Measurement measure(DataSource runtime,UUID batch,int commits) throws Exception {
        try(Connection c=runtime.getConnection()) {
            var s=c.createStatement();
            for(int warmup=0;warmup<5;warmup++) s.execute("UPDATE batch SET version=version+1,date_updated=clock_timestamp() WHERE uuid='"+batch+"'");
            s.execute("SELECT pg_stat_force_next_flush()");
            long before=reads(c);long start=System.nanoTime();
            for(int index=0;index<commits;index++) s.execute("UPDATE batch SET version=version+1,date_updated=clock_timestamp() WHERE uuid='"+batch+"'");
            long elapsed=System.nanoTime()-start;
            s.execute("SELECT pg_stat_force_next_flush()");
            return new Measurement(reads(c)-before,elapsed);
        }
    }
    private long reads(Connection c) throws Exception {
        c.createStatement().execute("SELECT pg_stat_clear_snapshot()");
        try(var result=c.createStatement().executeQuery("SELECT sum(seq_tup_read+idx_tup_fetch) FROM pg_stat_user_tables WHERE relname IN ('receivable','receivable_processing','settlement_request_item')")) {
            assertTrue(result.next());return result.getLong(1);
        }
    }
    private record Measurement(long rows,long nanos) {}
}
