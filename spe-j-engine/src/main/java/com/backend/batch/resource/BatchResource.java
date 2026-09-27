package com.backend.batch.resource;

import com.backend.batch.dto.CreateBatch;
import com.backend.batch.service.IBatchService;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/batches")
public class BatchResource {
  private final IBatchService service;

  public BatchResource(IBatchService service) {
    this.service = service;
  }

  @GetMapping
  public Object list(
      @RequestParam(defaultValue = "") String q,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.list(q, status, page, size);
  }

  @GetMapping("/{uuid}")
  public Object detail(@PathVariable UUID uuid) {
    return service.detail(uuid);
  }

  @GetMapping("/{uuid}/receivables")
  public Object receivables(
      @PathVariable UUID uuid,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.receivables(uuid, status, page, size);
  }

  @PostMapping(consumes = "application/json")
  public ResponseEntity<?> create(@RequestBody CreateBatch input) {
    var body = service.create(input);
    return ResponseEntity.created(URI.create("/api/batches/" + body.get("uuid"))).body(body);
  }
}
