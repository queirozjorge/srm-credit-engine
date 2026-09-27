package com.backend.exchange.resource;

import com.backend.exchange.dto.*;
import com.backend.exchange.service.IExchangeService;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/exchange")
public class ExchangeResource {
  private final IExchangeService service;

  public ExchangeResource(IExchangeService service) {
    this.service = service;
  }

  @GetMapping
  public ExchangeView view(
      @RequestParam(defaultValue = "proposals") String history,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.view(history, status, page, size);
  }

  @GetMapping("/reference")
  public ExchangeReference reference() {
    return service.reference();
  }

  @GetMapping("/proposals/{uuid}")
  public ExchangeProposal proposal(@PathVariable UUID uuid) {
    return service.proposal(uuid);
  }

  @PostMapping("/proposals")
  public ResponseEntity<Map<String, UUID>> propose(@RequestBody ProposalInput input) {
    UUID uuid = service.propose(input);
    return ResponseEntity.created(URI.create("/api/exchange/proposals/" + uuid))
        .body(Map.of("uuid", uuid));
  }

  @PatchMapping("/proposals/{uuid}")
  public ResponseEntity<Void> decide(@PathVariable UUID uuid, @RequestBody DecisionInput input) {
    service.decide(uuid, input);
    return ResponseEntity.noContent().build();
  }
}
