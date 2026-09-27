package com.backend.batch.repository;

import com.backend.batch.dto.ReceivableInput;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ImportRepository {
  private final JdbcTemplate jdbc;

  public ImportRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public record AssignorLookup(UUID uuid, String name, String document) {}

  public List<AssignorLookup> assignors(Set<String> documents) {
    if (documents.isEmpty()) return List.of();
    String placeholders = String.join(",", Collections.nCopies(documents.size(), "?"));
    return jdbc.query(
        "SELECT uuid,name,document_number FROM assignor WHERE deleted=false AND document_number IN"
            + " ("
            + placeholders
            + ")",
        (row, index) ->
            new AssignorLookup(
                row.getObject("uuid", UUID.class),
                row.getString("name"),
                row.getString("document_number")),
        documents.toArray());
  }

  public Set<String> existing(List<ReceivableInput> items) {
    if (items.isEmpty()) return Set.of();
    List<Object> values = new ArrayList<>();
    for (var item : items) {
      values.add(item.assignorUuid());
      values.add(item.type());
      values.add(item.externalReference());
    }
    String tuples =
        String.join(",", Collections.nCopies(items.size(), "(?::uuid,?::varchar,?::varchar)"));
    return new HashSet<>(
        jdbc.query(
            "SELECT r.assignor_uuid,r.type,r.external_reference FROM receivable r JOIN (VALUES "
                + tuples
                + ") AS wanted(assignor_uuid,type,external_reference) ON"
                + " r.assignor_uuid=wanted.assignor_uuid AND r.type=wanted.type AND"
                + " r.external_reference=wanted.external_reference",
            (row, index) ->
                identity(
                    row.getObject("assignor_uuid", UUID.class),
                    row.getString("type"),
                    row.getString("external_reference")),
            values.toArray()));
  }

  public static String identity(UUID assignor, String type, String reference) {
    return assignor + "/" + type + "/" + reference;
  }
}
