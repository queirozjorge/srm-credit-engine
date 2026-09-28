package com.backend.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;

class SchemaCompatibilityCheckerTest {
    @Test void acceptsExpectedVersionAndRequiredColumns() {
        assertDoesNotThrow(() -> new SchemaCompatibilityChecker(database("6", 16), "6").afterPropertiesSet());
    }
    @Test void rejectsUnknownSchemaVersion() {
        assertThrows(IllegalStateException.class, () -> new SchemaCompatibilityChecker(database("5", 16), "6").afterPropertiesSet());
    }
    @Test void rejectsMissingFinancialContractEvenWithExpectedVersion() {
        assertThrows(IllegalStateException.class, () -> new SchemaCompatibilityChecker(database("6", 15), "6").afterPropertiesSet());
    }
    private JdbcTemplate database(String version, int columns) {
        return new JdbcTemplate() {
            @Override
            public <T> T queryForObject(String sql, Class<T> requiredType) {
                return requiredType.cast(requiredType == String.class ? version : columns);
            }
        };
    }
}
