package com.backend.common.config;

import org.flywaydb.core.Flyway;
import java.util.Map;

/** Runs before Spring starts: no HTTP server, scheduler, JPA or application credentials. */
public final class SchemaMigrator {
    private SchemaMigrator() { }
    public static void migrate(Map<String, String> environment) {
        String engineRole = role(environment, "ENGINE_DB_USER");
        String workflowRole = role(environment, "WORKFLOW_DB_USER");
        Flyway.configure()
                .dataSource(required(environment, "DB_URL"), required(environment, "MIGRATION_DB_USER"),
                        required(environment, "MIGRATION_DB_PASSWORD"))
                .locations("classpath:db/migration")
                .placeholders(Map.of("engineRole", engineRole, "workflowRole", workflowRole))
                .cleanDisabled(true).baselineOnMigrate(false).load().migrate();
    }
    private static String required(Map<String, String> environment, String name) {
        String value = environment.get(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Configuração obrigatória: " + name);
        return value;
    }
    private static String role(Map<String, String> environment, String name) {
        String value = required(environment, name);
        if (!value.matches("[a-z_][a-z0-9_]{0,62}")) throw new IllegalStateException("Papel PostgreSQL inválido: " + name);
        return value;
    }
}
