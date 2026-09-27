package com.backend.exchange.service;

import com.backend.exchange.dto.*;
import java.time.Instant;
import java.util.UUID;

public interface IExchangeService {
  ExchangeView view(String history, String status, int page, int size);

  ExchangeProposal proposal(UUID uuid);

  UUID propose(ProposalInput input);

  void decide(UUID uuid, DecisionInput input);

  ExchangeQuote currentQuote(Instant at);

  ExchangeQuote requireQuote(Instant at);

  ExchangeReference reference();
}
