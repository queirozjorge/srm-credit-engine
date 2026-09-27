package com.backend.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "management.server.port=0",
                "workflow.schema.check-enabled=false",
                "workflow.consumer.enabled=false",
                "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
                "springdoc.api-docs.enabled=false",
                "springdoc.swagger-ui.enabled=false"
        }
)
class ActuatorHealthEndpointTest {

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    org.springframework.jdbc.core.JdbcTemplate jdbc;
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    org.springframework.transaction.PlatformTransactionManager transactionManager;

    private final HttpClient httpClient = HttpClient.newHttpClient();

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

    private String managementUrl(String path) {
        return "http://localhost:%d%s".formatted(managementPort, path);
    }
}
