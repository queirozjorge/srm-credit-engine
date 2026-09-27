package com.backend.settlement.resource;

import com.backend.settlement.service.IStatementService;
import java.time.Instant;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/settlements/items")
public class StatementResource {
  private final IStatementService service;

  public StatementResource(IStatementService service) {
    this.service = service;
  }

  @GetMapping
  public Object list(
      @RequestParam(required = false) Instant start,
      @RequestParam(required = false) Instant end,
      @RequestParam(required = false) UUID assignorUuid,
      @RequestParam(required = false) String paymentCurrency,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.list(start, end, assignorUuid, paymentCurrency, page, size);
  }
}
