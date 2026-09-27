package com.backend.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.ProducerFactory;
import io.micrometer.core.instrument.MeterRegistry;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "management.server.port=0",
                "engine.outbox.enabled=false",
                "spring.flyway.enabled=true",
                "spring.flyway.placeholders.engineRole=srm_engine",
                "spring.flyway.placeholders.workflowRole=srm_workflow",
                "springdoc.api-docs.enabled=false",
                "springdoc.swagger-ui.enabled=false"
        }
)
class ActuatorHealthEndpointIT {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17.11-trixie")
            .withInitScript("db/test-roles.sql");
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }


    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Autowired MeterRegistry meters;
    @Autowired ProducerFactory<String, String> producers;

    @LocalManagementPort
    private int managementPort;

    @Test
    void exposesReadinessWithoutHealthDetails() throws Exception {
        HttpResponse<String> response = httpClient.send(
                HttpRequest.newBuilder(URI.create(managementUrl("/actuator/health/readiness")))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(HttpStatus.OK.value(), response.statusCode());
        assertTrue(response.body().contains("\"status\":\"UP\""));
        assertFalse(response.body().contains("components"));
        assertFalse(response.body().contains("details"));
    }

    @Test
    void doesNotExposeEnvironmentEndpoint() throws Exception {
        HttpResponse<String> response = httpClient.send(
                HttpRequest.newBuilder(URI.create(managementUrl("/actuator/env")))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertEquals(HttpStatus.NOT_FOUND.value(), response.statusCode());
    }

    @Test
    void exposesPoolAndProducerMetricsForOutboxDiagnosis() throws Exception {
        assertTrue(meters.find("hikaricp.connections.active").gauge() != null);
        assertTrue(meters.find("hikaricp.connections.pending").gauge() != null);
        try (var producer = producers.createProducer()) {
            assertFalse(producer.metrics().isEmpty());
            assertTrue(meters.getMeters().stream().anyMatch(meter -> meter.getId().getName().startsWith("kafka.producer.")));
            var response = httpClient.send(
                    HttpRequest.newBuilder(URI.create(managementUrl("/actuator/metrics"))).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
            assertTrue(response.body().contains("hikaricp.connections.pending"));
            assertTrue(response.body().contains("kafka.producer."));
        }
    }

    private String managementUrl(String path) {
        return "http://localhost:%d%s".formatted(managementPort, path);
    }
}
