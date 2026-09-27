package com.backend.batch.resource;

import com.backend.batch.dto.*;
import com.backend.batch.service.IImportService;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/batches")
public class ImportResource {
  private final IImportService service;

  public ImportResource(IImportService service) {
    this.service = service;
  }

  @PostMapping(value = "/preview", consumes = "multipart/form-data")
  public ImportPreview preview(@RequestPart MultipartFile file, @RequestParam String format) {
    return service.preview(file, format);
  }

  @PostMapping(consumes = "multipart/form-data")
  public ResponseEntity<?> create(
      @RequestPart MultipartFile file,
      @RequestParam String format,
      @RequestPart(required = false) List<PaymentCurrencyChoice> paymentCurrencies) {
    var body = service.create(file, format, paymentCurrencies);
    return ResponseEntity.created(URI.create("/api/batches/" + body.get("uuid"))).body(body);
  }
}
