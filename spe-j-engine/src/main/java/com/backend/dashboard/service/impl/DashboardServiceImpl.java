package com.backend.dashboard.service.impl;

import com.backend.common.validation.Inputs;
import com.backend.dashboard.repository.DashboardRepository;
import com.backend.dashboard.service.IDashboardService;
import java.time.*;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class DashboardServiceImpl implements IDashboardService {
  private final DashboardRepository repository;
  private final Clock clock;

  public DashboardServiceImpl(DashboardRepository repository, Clock clock) {
    this.repository = repository;
    this.clock = clock;
  }

  public Object get(String period) {
    Inputs.choice(period, Set.of("LAST_7_DAYS", "CURRENT_MONTH"));
    var now = clock.instant();
    var zone = ZoneId.of("America/Sao_Paulo");
    var today = now.atZone(zone).toLocalDate();
    var first = period.equals("LAST_7_DAYS") ? today.minusDays(6) : today.withDayOfMonth(1);
    return repository.aggregate(
        period,
        first,
        today,
        first.atStartOfDay(zone).toInstant(),
        today.plusDays(1).atStartOfDay(zone).toInstant(),
        now);
  }
}
