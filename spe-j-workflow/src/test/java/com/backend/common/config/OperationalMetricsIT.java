package com.backend.common.config;

import com.backend.settlement.service.impl.SettlementMetrics;
import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.MeterRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "management.server.port=0", "workflow.schema.check-enabled=false", "workflow.consumer.enabled=false",
    "WORKFLOW_DB_POOL_MAX_SIZE=6", "WORKFLOW_DB_POOL_MIN_IDLE=2",
    "WORKFLOW_DB_CONNECTION_TIMEOUT_MS=2000", "WORKFLOW_CONSUMER_CONCURRENCY=2"
})
class OperationalMetricsIT {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-trixie");
    @Container static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.2.1");
    @DynamicPropertySource static void infrastructure(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", POSTGRES::getUsername);
        properties.add("spring.datasource.password", POSTGRES::getPassword);
        properties.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource source;
    @Autowired MeterRegistry meters;
    @Autowired SettlementMetrics settlements;
    @Autowired ConsumerFactory<Object, Object> consumers;
    @Autowired Environment environment;
    @LocalManagementPort int managementPort;
    @LocalServerPort int applicationPort;

    @Test void exposesRealPoolAndKafkaMetricsOnlyOnInternalManagementPort() throws Exception {
        assertEquals(1, jdbc.queryForObject("select 1", Integer.class));
        var pool = source.unwrap(HikariDataSource.class);
        assertEquals(6, pool.getMaximumPoolSize());
        assertEquals(2, pool.getMinimumIdle());
        assertEquals(2000, pool.getConnectionTimeout());
        assertEquals("2", environment.getProperty("workflow.consumer.concurrency"));
        assertNotNull(meters.find("hikaricp.connections.active").gauge());
        assertNotNull(meters.find("hikaricp.connections.pending").gauge());
        assertNotNull(meters.find("hikaricp.connections.acquire").timer());
        assertEquals(6, meters.get("hikaricp.connections.max").gauge().value());
        try (var consumer = consumers.createConsumer("metrics-" + UUID.randomUUID())) {
            assertFalse(consumer.metrics().isEmpty());
            assertTrue(meters.getMeters().stream().anyMatch(meter -> meter.getId().getName().startsWith("kafka.consumer.")));
            settlements.duration(1000000);
            settlements.outcome("settled");
            var names = get(managementPort, "/actuator/metrics");
            assertEquals(200, names.statusCode());
            assertTrue(names.body().contains("hikaricp.connections.pending"));
            assertTrue(names.body().contains("kafka.consumer."));
            assertTrue(names.body().contains("workflow.settlement.duration"));
            var duration = get(managementPort, "/actuator/metrics/workflow.settlement.duration");
            assertEquals(200, duration.statusCode());
            assertTrue(duration.body().contains("COUNT"));
            assertTrue(meters.get("workflow.settlement.duration").timer().takeSnapshot().percentileValues().length > 0);
        }
        assertEquals(404, get(managementPort, "/actuator/env").statusCode());
        assertEquals(404, get(applicationPort, "/actuator/metrics").statusCode());
    }

    private HttpResponse<String> get(int port, String path) throws Exception {
        return HttpClient.newHttpClient().send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
            HttpResponse.BodyHandlers.ofString());
    }
}
