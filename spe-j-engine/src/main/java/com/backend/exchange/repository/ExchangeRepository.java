package com.backend.exchange.repository;

import com.backend.common.security.Actor;
import com.backend.exchange.dto.*;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ExchangeRepository {
  private final JdbcTemplate jdbc;

  public ExchangeRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public ExchangeQuote current(Instant at) {
    return jdbc
        .query(
            "SELECT * FROM exchange_rate WHERE effective_from <= ? ORDER BY effective_from"
                + " DESC,uuid DESC LIMIT 1",
            this::quote,
            Timestamp.from(at))
        .stream()
        .findFirst()
        .orElse(null);
  }

  public ExchangeProposal proposal(UUID uuid) {
    return jdbc.query(PROPOSAL_SELECT + " WHERE p.uuid = ?", this::mapProposal, uuid).stream()
        .findFirst()
        .orElse(null);
  }

  public List<ExchangeProposal> proposals(String status, int size, long offset) {
    return jdbc.query(
        PROPOSAL_SELECT
            + " WHERE (?::text IS NULL OR p.status = ?) ORDER BY p.date_register DESC,p.uuid DESC"
            + " LIMIT ? OFFSET ?",
        this::mapProposal,
        status,
        status,
        size,
        offset);
  }

  public long proposalCount(String status) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM exchange_rate_proposal WHERE (?::text IS NULL OR status = ?)",
        Long.class,
        status,
        status);
  }

  public List<ExchangeQuote> quotes(int size, long offset) {
    return jdbc.query(
        "SELECT * FROM exchange_rate ORDER BY effective_from DESC,uuid DESC LIMIT ? OFFSET ?",
        this::quote,
        size,
        offset);
  }

  public long quoteCount() {
    return jdbc.queryForObject("SELECT count(*) FROM exchange_rate", Long.class);
  }

  public void insertProposal(UUID uuid, BigDecimal rate, String reason, Actor actor, Instant at) {
    jdbc.update(
        """
INSERT INTO exchange_rate_proposal (uuid,base_currency,quote_currency,proposed_rate,justification,status,
requested_by_issuer,requested_by_subject,version,date_register) VALUES (?,'USD','BRL',?,?,'PENDING',?,?,0,?)
""",
        uuid,
        rate,
        reason,
        actor.issuer(),
        actor.subject(),
        Timestamp.from(at));
  }

  public int decide(
      UUID uuid, long version, String status, String reason, Actor actor, Instant at) {
    return jdbc.update(
        """
UPDATE exchange_rate_proposal SET status=?,decision_reason=?,decided_by_issuer=?,decided_by_subject=?,
decided_at=?,date_updated=?,version=version+1 WHERE uuid=? AND status='PENDING' AND version=?
""",
        status,
        reason,
        actor.issuer(),
        actor.subject(),
        Timestamp.from(at),
        Timestamp.from(at),
        uuid,
        version);
  }

  public void insertQuote(UUID uuid, UUID proposal, BigDecimal rate, Instant at) {
    jdbc.update(
        "INSERT INTO exchange_rate"
            + " (uuid,proposal_uuid,base_currency,quote_currency,rate,effective_from,date_register)"
            + " VALUES (?,?,'USD','BRL',?,?,?)",
        uuid,
        proposal,
        rate,
        Timestamp.from(at),
        Timestamp.from(at));
  }

  private ExchangeQuote quote(ResultSet row, int index) throws SQLException {
    Instant at = row.getTimestamp("effective_from").toInstant();
    return new ExchangeQuote(
        row.getObject("uuid", UUID.class),
        row.getObject("proposal_uuid", UUID.class),
        row.getBigDecimal("rate").stripTrailingZeros().toPlainString(),
        at,
        at.plusSeconds(86400));
  }

  private ExchangeProposal mapProposal(ResultSet row, int index) throws SQLException {
    String status = row.getString("status");
    ExchangeProposal.Decision decision = null;
    if (!"PENDING".equals(status)) {
      ExchangeQuote quote = null;
      if (row.getObject("quote_uuid") != null) {
        Instant at = row.getTimestamp("effective_from").toInstant();
        quote =
            new ExchangeQuote(
                row.getObject("quote_uuid", UUID.class),
                row.getObject("uuid", UUID.class),
                row.getBigDecimal("rate").stripTrailingZeros().toPlainString(),
                at,
                at.plusSeconds(86400));
      }
      decision =
          new ExchangeProposal.Decision(
              status,
              new Actor(row.getString("decided_by_issuer"), row.getString("decided_by_subject")),
              row.getTimestamp("decided_at").toInstant(),
              row.getString("decision_reason"),
              quote);
    }
    return new ExchangeProposal(
        row.getObject("uuid", UUID.class),
        row.getBigDecimal("proposed_rate").stripTrailingZeros().toPlainString(),
        row.getString("justification"),
        status,
        new Actor(row.getString("requested_by_issuer"), row.getString("requested_by_subject")),
        row.getTimestamp("date_register").toInstant(),
        Long.toString(row.getLong("version")),
        decision);
  }

  private static final String PROPOSAL_SELECT =
      "SELECT p.*,q.uuid AS quote_uuid,q.rate,q.effective_from FROM exchange_rate_proposal p LEFT"
          + " JOIN exchange_rate q ON q.proposal_uuid=p.uuid";
}
