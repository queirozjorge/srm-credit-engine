package com.backend.common.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Fail application startup before any future listener starts; never migrates schema. */
@Component
@ConditionalOnProperty(name = "workflow.schema.check-enabled", havingValue = "true", matchIfMissing = true)
public class SchemaCompatibilityChecker implements InitializingBean {
    private final JdbcTemplate jdbc;
    private final String expectedVersion;

    public SchemaCompatibilityChecker(JdbcTemplate jdbc,
            @Value("${workflow.schema.expected-version:3}") String expectedVersion) {
        this.jdbc = jdbc;
        this.expectedVersion = expectedVersion;
    }

    @Override
    public void afterPropertiesSet() {
        String actual = jdbc.queryForObject("""
            SELECT version FROM flyway_schema_history
            WHERE success AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1
            """, String.class);
        if (!expectedVersion.equals(actual)) {
            throw new IllegalStateException("Schema incompatível: versão esperada " + expectedVersion + ", encontrada " + actual + ".");
        }
        Integer columns = jdbc.queryForObject("""
            SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
              AND ((table_name='settlement' AND column_name IN ('receivable_uuid','attempt_uuid'))
              OR (table_name='settlement_request_item' AND column_name IN ('failure_stage','retry_count'))
              OR (table_name='outbox_message' AND column_name IN ('claim_token','claim_expires_at')))
            """, Integer.class);
        if (columns == null || columns != 6) {
            throw new IllegalStateException("Schema incompatível: contratos financeiros ausentes.");
        }
    }
}
