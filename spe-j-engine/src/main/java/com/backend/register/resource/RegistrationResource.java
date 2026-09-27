package com.backend.register.resource;

import com.backend.register.dto.AssignorInput;
import com.backend.register.service.IRegistrationService;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/assignors")
public class RegistrationResource {
  private final IRegistrationService service;

  public RegistrationResource(IRegistrationService service) {
    this.service = service;
  }

  @GetMapping
  public Object list(
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "false") boolean activeOnly,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.list(q, activeOnly, page, size);
  }

  @GetMapping("/{uuid}")
  public Object get(@PathVariable UUID uuid) {
    return service.get(uuid);
  }

  @PostMapping
  public ResponseEntity<?> create(@RequestBody AssignorInput.Create input) {
    var uuid = service.create(input);
    return ResponseEntity.created(URI.create("/api/assignors/" + uuid)).body(Map.of("uuid", uuid));
  }

  @PatchMapping("/{uuid}")
  public ResponseEntity<Void> update(
      @PathVariable UUID uuid, @RequestBody AssignorInput.Patch input) {
    service.update(uuid, input);
    return ResponseEntity.noContent().build();
  }
}
