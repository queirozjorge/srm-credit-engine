package com.backend.settlement.resource;

import com.backend.settlement.dto.SettlementInput;
import com.backend.settlement.service.ISettlementService;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class SettlementResource {
  private final ISettlementService service;

  public SettlementResource(ISettlementService service) {
    this.service = service;
  }

  @PostMapping("/batches/{uuid}/settlements")
  public ResponseEntity<?> accept(
      @PathVariable UUID uuid,
      @RequestHeader("Idempotency-Key") String key,
      @RequestBody(required = false) SettlementInput input) {
    var response = service.accept(uuid, key, input);
    return ResponseEntity.status(response.status())
        .location(URI.create("/api/settlement-requests/" + response.requestUuid()))
        .body(response.body());
  }
}
