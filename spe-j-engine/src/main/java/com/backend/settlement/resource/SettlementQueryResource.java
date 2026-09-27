package com.backend.settlement.resource;

import com.backend.settlement.service.ISettlementQueryService;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
public class SettlementQueryResource {
  private final ISettlementQueryService service;

  public SettlementQueryResource(ISettlementQueryService service) {
    this.service = service;
  }

  @GetMapping("/settlement-requests/{uuid}")
  public Object get(@PathVariable UUID uuid) {
    return service.get(uuid);
  }

  @GetMapping("/batches/{uuid}/settlements")
  public Object list(
      @PathVariable UUID uuid,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.list(uuid, page, size);
  }

  @GetMapping("/settlement-requests/{uuid}/items")
  public Object items(
      @PathVariable UUID uuid,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.items(uuid, status, page, size);
  }

  @GetMapping("/batches/{uuid}/audit-events")
  public Object audit(
      @PathVariable UUID uuid,
      @RequestParam(required = false) UUID receivableUuid,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.audit(uuid, receivableUuid, page, size);
  }
}
