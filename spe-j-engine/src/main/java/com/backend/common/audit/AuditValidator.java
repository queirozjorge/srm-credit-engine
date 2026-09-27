package com.backend.common.audit;

import java.time.Instant;
import java.util.*;
import java.util.function.Consumer;
import org.springframework.stereotype.Component;

/**
 * Closed event contracts prevent accidental credentials or untyped payloads in permanent history.
 */
@Component
public class AuditValidator {
  private record Policy(
      Set<String> references, Set<String> fields, Consumer<Map<String, Object>> validate) {}

  private final Map<String, Policy> policies =
      Map.ofEntries(
          Map.entry(
              "ASSIGNOR_CREATED",
              new Policy(
                  Set.of("assignor_uuid"),
                  Set.of("name", "documentNumber"),
                  details -> {
                    text(details.get("name"));
                    text(details.get("documentNumber"));
                  })),
          Map.entry(
              "ASSIGNOR_UPDATED",
              new Policy(
                  Set.of("assignor_uuid"),
                  Set.of("name"),
                  details -> {
                    var name = object(details.get("name"));
                    keys(name, Set.of("previous", "current"));
                    text(name.get("previous"));
                    text(name.get("current"));
                  })),
          Map.entry(
              "BATCH_CREATED",
              new Policy(
                  Set.of("batch_uuid"),
                  Set.of("source", "itemCount"),
                  details -> {
                    require(Set.of("FORM", "CSV", "CNAB").contains(details.get("source")));
                    integer(details.get("itemCount"), 1, 1000);
                  })),
          Map.entry(
              "SETTLEMENT_REQUESTED",
              new Policy(
                  Set.of("batch_uuid", "request_uuid"),
                  Set.of("receivableUuids"),
                  details -> selection(details.get("receivableUuids")))),
          Map.entry(
              "SETTLEMENT_REPROCESS_REQUESTED",
              new Policy(
                  Set.of("batch_uuid", "request_uuid"),
                  Set.of("receivableUuids", "reason"),
                  details -> {
                    selection(details.get("receivableUuids"));
                    String reason = text(details.get("reason"));
                    require(reason.length() <= 500 && reason.equals(reason.trim()));
                  })),
          Map.entry(
              "RECEIVABLE_ATTEMPT_ACCEPTED",
              new Policy(
                  Set.of("batch_uuid", "request_uuid", "receivable_uuid", "attempt_uuid"),
                  Set.of("attemptNumber", "previousAttemptUuid", "termDays", "spread"),
                  details -> {
                    integer(details.get("attemptNumber"), 1, Integer.MAX_VALUE);
                    integer(details.get("termDays"), 0, Integer.MAX_VALUE);
                    if (details.get("previousAttemptUuid") != null)
                      uuid(details.get("previousAttemptUuid"));
                    String spread = text(details.get("spread"));
                    require(spread.matches("[0-9]+(?:\\.[0-9]{1,12})?"));
                  })),
          Map.entry(
              "RECEIVABLE_ATTEMPT_REJECTED",
              new Policy(
                  Set.of("batch_uuid", "request_uuid", "receivable_uuid", "attempt_uuid"),
                  Set.of("failure"),
                  details -> {
                    var failure = object(details.get("failure"));
                    keys(failure, Set.of("code", "message", "stage", "occurredAt"));
                    text(failure.get("code"));
                    text(failure.get("message"));
                    require("ACCEPTANCE".equals(failure.get("stage")));
                    instant(failure.get("occurredAt"));
                  })),
          Map.entry(
              "EXCHANGE_RATE_PROPOSED",
              new Policy(
                  Set.of("proposal_uuid"),
                  Set.of("baseCurrency", "quoteCurrency", "proposedRate", "justification"),
                  details -> {
                    require(
                        "USD".equals(details.get("baseCurrency"))
                            && "BRL".equals(details.get("quoteCurrency")));
                    rate(details.get("proposedRate"));
                    text(details.get("justification"));
                  })),
          Map.entry(
              "EXCHANGE_RATE_APPROVED",
              new Policy(
                  Set.of("proposal_uuid", "exchange_rate_uuid"),
                  Set.of("rate", "effectiveFrom"),
                  details -> {
                    rate(details.get("rate"));
                    instant(details.get("effectiveFrom"));
                  })),
          Map.entry(
              "EXCHANGE_RATE_REJECTED",
              new Policy(
                  Set.of("proposal_uuid"),
                  Set.of("reason"),
                  details -> text(details.get("reason")))));

  public void validate(String type, Map<String, UUID> references, Map<String, Object> details) {
    var policy = policies.get(type);
    require(policy != null && references != null && details != null);
    require(
        references.keySet().equals(policy.references())
            && references.values().stream().allMatch(Objects::nonNull));
    keys(details, policy.fields());
    policy.validate().accept(details);
  }

  private static void keys(Map<?, ?> details, Set<String> expected) {
    require(details.keySet().equals(expected));
  }

  private static String text(Object value) {
    require(value instanceof String && !((String) value).isBlank());
    return (String) value;
  }

  private static void integer(Object value, int min, int max) {
    require(value instanceof Integer || value instanceof Long);
    long number = ((Number) value).longValue();
    require(number >= min && number <= max);
  }

  private static Map<?, ?> object(Object value) {
    require(value instanceof Map<?, ?>);
    return (Map<?, ?>) value;
  }

  private static void uuid(Object value) {
    try {
      UUID.fromString(Objects.toString(value, ""));
    } catch (IllegalArgumentException error) {
      throw new IllegalArgumentException("UUID de auditoria inválido.", error);
    }
  }

  private static void selection(Object value) {
    require(value instanceof List<?>);
    var list = (List<?>) value;
    require(!list.isEmpty() && list.size() <= 1000 && new HashSet<>(list).size() == list.size());
    list.forEach(AuditValidator::uuid);
  }

  private static void rate(Object value) {
    String text = text(value);
    require(text.matches("[0-9]+(?:\\.[0-9]{1,12})?"));
    require(new java.math.BigDecimal(text).signum() > 0);
  }

  private static void instant(Object value) {
    if (value instanceof Instant) return;
    try {
      Instant.parse(text(value));
    } catch (java.time.DateTimeException error) {
      throw new IllegalArgumentException("Instante de auditoria inválido.", error);
    }
  }

  private static void require(boolean valid) {
    if (!valid)
      throw new IllegalArgumentException("Evento de auditoria incompatível com seu contrato.");
  }
}
