package com.backend.settlement.service.impl;

import com.backend.common.validation.Inputs;
import com.backend.settlement.repository.StatementRepository;
import com.backend.settlement.service.IStatementService;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StatementServiceImpl implements IStatementService {
  private final StatementRepository repository;

  public StatementServiceImpl(StatementRepository repository) {
    this.repository = repository;
  }

  public Object list(
      Instant start, Instant end, UUID assignor, String currency, int page, int size) {
    Inputs.pagination(page, size);
    if (start != null && end != null && !start.isBefore(end))
      throw Inputs.invalid("O início deve ser anterior ao fim do período.");
    if (currency != null) Inputs.choice(currency, Set.of("BRL", "USD"));
    return repository.list(start, end, assignor, currency, page, size);
  }
}
