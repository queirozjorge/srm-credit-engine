package com.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class EngineApplication {

    public static void main(String[] args) {
        if (java.util.Arrays.asList(args).contains("--engine.migrate-only")) {
            com.backend.common.config.SchemaMigrator.migrate(System.getenv());
            return;
        }
        SpringApplication.run(EngineApplication.class, args);
    }
}
