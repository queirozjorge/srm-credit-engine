package com.backend.exchange.service.impl;

import com.backend.common.audit.AuditService;
import com.backend.common.dto.PageResponse;
import com.backend.common.exceptions.ApiException;
import com.backend.common.pricing.PricingEngine;
import com.backend.common.security.ActorProvider;
import com.backend.exchange.dto.*;
import com.backend.exchange.repository.ExchangeRepository;
import com.backend.exchange.service.IExchangeService;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExchangeServiceImpl implements IExchangeService {
  private final ExchangeRepository repository;
  private final ActorProvider actors;
  private final AuditService audit;
  private final Clock clock;
  private final ReferenceService reference;

  public ExchangeServiceImpl(
      ExchangeRepository repository,
      ActorProvider actors,
      AuditService audit,
      Clock clock,
      ReferenceService reference) {
    this.repository = repository;
    this.actors = actors;
    this.audit = audit;
    this.clock = clock;
    this.reference = reference;
  }

  @Override
  @Transactional(readOnly = true)
  public ExchangeView view(String history, String status, int page, int size) {
    PageResponse.validate(page, size);
    if (!Set.of("proposals", "quotes").contains(history)
        || status != null
            && (!"proposals".equals(history)
                || !Set.of("PENDING", "APPROVED", "REJECTED").contains(status)))
      throw bad("Filtro de câmbio inválido.");
    Instant at = clock.instant();
    var quote = currentQuote(at);
    String currentStatus =
        quote == null ? "ABSENT" : at.isAfter(quote.validUntil()) ? "EXPIRED" : "VALID";
    long offset = (long) (page - 1) * size;
    PageResponse<?> result =
        "quotes".equals(history)
            ? PageResponse.of(repository.quotes(size, offset), page, size, repository.quoteCount())
            : PageResponse.of(
                repository.proposals(status, size, offset),
                page,
                size,
                repository.proposalCount(status));
    return new ExchangeView(at, quote, currentStatus, new ExchangeView.History(history, result));
  }

  @Override
  @Transactional(readOnly = true)
  public ExchangeProposal proposal(UUID uuid) {
    var result = repository.proposal(uuid);
    if (result == null)
      throw new ApiException(404, "RECURSO_NAO_ENCONTRADO", "A proposta não foi encontrada.");
    return result;
  }

  @Override
  @Transactional
  @PreAuthorize("hasRole('OPERADOR')")
  public UUID propose(ProposalInput input) {
    if (input == null
        || input.proposedRate() == null
        || !input.proposedRate().matches("[0-9]+(?:\\.[0-9]{1,12})?"))
      throw bad("Informe uma cotação decimal válida.");
    var rate = new BigDecimal(input.proposedRate());
    PricingEngine.checkRate(rate, true);
    String reason = reason(input.justification());
    UUID uuid = UUID.randomUUID();
    repository.insertProposal(uuid, rate, reason, actors.current(), clock.instant());
    audit.record(
        "EXCHANGE_RATE_PROPOSED",
        Map.of("proposal_uuid", uuid),
        Map.of(
            "baseCurrency",
            "USD",
            "quoteCurrency",
            "BRL",
            "proposedRate",
            rate.toPlainString(),
            "justification",
            reason));
    return uuid;
  }

  @Override
  @Transactional
  @PreAuthorize("hasRole('GESTOR')")
  public void decide(UUID uuid, DecisionInput input) {
    if (input == null
        || input.status() == null
        || !Set.of("APPROVED", "REJECTED").contains(input.status())
        || input.version() == null
        || !input.version().matches("[0-9]+")) throw bad("Decisão ou versão inválida.");
    long version;
    try {
      version = Long.parseLong(input.version());
    } catch (NumberFormatException error) {
      throw bad("Versão inválida.");
    }
    var proposal = proposal(uuid);
    var actor = actors.current();
    if (actor.sameIdentity(proposal.requestedBy()))
      throw new ApiException(
          403, "AUTOAPROVACAO_PROIBIDA", "A decisão exige um gestor diferente do solicitante.");
    if (!"PENDING".equals(proposal.status()))
      throw new ApiException(409, "PROPOSTA_JA_DECIDIDA", "Esta proposta já foi decidida.");
    String reason =
        "REJECTED".equals(input.status())
            ? reason(input.decisionReason())
            : input.decisionReason() == null ? null : reason(input.decisionReason());
    Instant now = clock.instant();
    if (repository.decide(uuid, version, input.status(), reason, actor, now) != 1)
      throw new ApiException(
          409, "VERSAO_DESATUALIZADA", "A proposta foi alterada. Atualize a consulta.");
    if ("APPROVED".equals(input.status())) {
      UUID quoteUuid = UUID.randomUUID();
      repository.insertQuote(quoteUuid, uuid, new BigDecimal(proposal.proposedRate()), now);
      audit.record(
          "EXCHANGE_RATE_APPROVED",
          Map.of("proposal_uuid", uuid, "exchange_rate_uuid", quoteUuid),
          Map.of("rate", proposal.proposedRate(), "effectiveFrom", now.toString()));
    } else
      audit.record(
          "EXCHANGE_RATE_REJECTED", Map.of("proposal_uuid", uuid), Map.of("reason", reason));
  }

  @Override
  public ExchangeQuote currentQuote(Instant at) {
    return repository.current(at);
  }

  @Override
  public ExchangeQuote requireQuote(Instant at) {
    var quote = currentQuote(at);
    if (quote == null)
      throw new ApiException(
          422, "COTACAO_AUSENTE", "Não há cotação cadastrada para pagamento em dólares.");
    if (at.isAfter(quote.validUntil()))
      throw new ApiException(
          422, "COTACAO_EXPIRADA", "A cotação para pagamento em dólares está expirada.");
    return quote;
  }

  @Override
  public ExchangeReference reference() {
    return reference.fetch();
  }

  private String reason(String value) {
    if (value == null || value.isBlank() || value.trim().length() > 500)
      throw new ApiException(
          422, "DADOS_INVALIDOS", "Informe uma justificativa entre 1 e 500 caracteres.");
    return value.trim();
  }

  private ApiException bad(String message) {
    return new ApiException(400, "REQUISICAO_INVALIDA", message);
  }
}
