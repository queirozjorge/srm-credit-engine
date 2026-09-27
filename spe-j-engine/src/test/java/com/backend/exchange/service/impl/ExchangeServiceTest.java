package com.backend.exchange.service.impl;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.backend.common.audit.AuditService;
import com.backend.common.exceptions.ApiException;
import com.backend.common.security.Actor;
import com.backend.common.security.ActorProvider;
import com.backend.exchange.dto.*;
import com.backend.exchange.repository.ExchangeRepository;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ExchangeServiceTest {
  private final ExchangeRepository repository = mock(ExchangeRepository.class);
  private final ActorProvider actors = mock(ActorProvider.class);
  private final AuditService audit = mock(AuditService.class);
  private final Instant now = Instant.parse("2026-09-27T12:00:00Z");
  private final ExchangeServiceImpl service =
      new ExchangeServiceImpl(
          repository,
          actors,
          audit,
          Clock.fixed(now, ZoneOffset.UTC),
          mock(ReferenceService.class));

  @Test
  void quoteValidityIncludesExact24HourBoundary() {
    var quote =
        new ExchangeQuote(
            UUID.randomUUID(), UUID.randomUUID(), "5.4321", now.minusSeconds(86400), now);
    when(repository.current(now)).thenReturn(quote);
    assertSame(quote, service.requireQuote(now));
    when(repository.current(now.plusNanos(1))).thenReturn(quote);
    assertEquals(
        "COTACAO_EXPIRADA",
        assertThrows(ApiException.class, () -> service.requireQuote(now.plusNanos(1))).code());
  }

  @Test
  void rejectsSelfDecisionUsingFullAuthenticatedIdentity() {
    UUID id = UUID.randomUUID();
    var actor = new Actor("issuer", "operator");
    when(actors.current()).thenReturn(actor);
    when(repository.proposal(id))
        .thenReturn(new ExchangeProposal(id, "5.43", "Motivo", "PENDING", actor, now, "0", null));
    assertEquals(
        "AUTOAPROVACAO_PROIBIDA",
        assertThrows(
                ApiException.class,
                () -> service.decide(id, new DecisionInput("APPROVED", "0", null)))
            .code());
    verify(repository, never()).insertQuote(any(), any(), any(), any());
  }

  @Test
  void detectsConcurrentDecisionAndDoesNotWriteQuote() {
    UUID id = UUID.randomUUID();
    when(actors.current()).thenReturn(new Actor("issuer", "manager"));
    when(repository.proposal(id))
        .thenReturn(
            new ExchangeProposal(
                id, "5.43", "Motivo", "PENDING", new Actor("issuer", "operator"), now, "1", null));
    assertEquals(
        "VERSAO_DESATUALIZADA",
        assertThrows(
                ApiException.class,
                () -> service.decide(id, new DecisionInput("APPROVED", "0", null)))
            .code());
    verify(repository, never()).insertQuote(any(), any(), any(), any());
    verifyNoInteractions(audit);
  }

  @Test
  void absenceIsBusinessStateNotReferenceProviderError() {
    assertEquals(
        "COTACAO_AUSENTE",
        assertThrows(ApiException.class, () -> service.requireQuote(now)).code());
  }
}
