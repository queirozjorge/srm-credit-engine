package com.backend.common.audit;

import static org.junit.jupiter.api.Assertions.*;

import com.backend.common.dto.Views;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;

class AuditValidatorTest {
  private final AuditValidator validator = new AuditValidator();

  @Test
  void rejectsUnknownTypesUnexpectedFieldsAndWrongReferences() {
    UUID id = UUID.randomUUID();
    assertThrows(
        IllegalArgumentException.class, () -> validator.validate("UNKNOWN", Map.of(), Map.of()));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            validator.validate(
                "ASSIGNOR_CREATED",
                Map.of("assignor_uuid", id),
                Map.of("name", "Cedente", "documentNumber", "11222333000181", "jwt", "secret")));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            validator.validate(
                "ASSIGNOR_CREATED",
                Map.of("batch_uuid", id),
                Map.of("name", "Cedente", "documentNumber", "11222333000181")));
  }

  @Test
  void acceptsSnapshotReferencesAndRejectsMalformedFailure() {
    var references =
        Map.of(
            "batch_uuid",
            UUID.randomUUID(),
            "request_uuid",
            UUID.randomUUID(),
            "receivable_uuid",
            UUID.randomUUID(),
            "attempt_uuid",
            UUID.randomUUID());
    assertDoesNotThrow(
        () ->
            validator.validate(
                "RECEIVABLE_ATTEMPT_ACCEPTED",
                references,
                Views.of(
                    "attemptNumber",
                    1,
                    "previousAttemptUuid",
                    null,
                    "termDays",
                    15,
                    "spread",
                    "0.015")));
    assertDoesNotThrow(
        () ->
            validator.validate(
                "RECEIVABLE_ATTEMPT_REJECTED",
                references,
                Map.of(
                    "failure",
                    Map.of(
                        "code",
                        "COTACAO_AUSENTE",
                        "message",
                        "Cotação ausente.",
                        "stage",
                        "ACCEPTANCE",
                        "occurredAt",
                        Instant.now()))));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            validator.validate(
                "RECEIVABLE_ATTEMPT_REJECTED",
                references,
                Map.of("failure", Map.of("code", "COTACAO_AUSENTE"))));
  }
}
