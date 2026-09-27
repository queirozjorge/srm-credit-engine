package com.backend.batch.service.impl;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.backend.batch.dto.*;
import com.backend.batch.proxy.*;
import com.backend.batch.repository.ImportRepository;
import com.backend.batch.service.IBatchService;
import com.backend.common.exceptions.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class ImportServiceTest {
  private final ImportRepository repository = mock(ImportRepository.class);
  private final ReceivableValidation validation = mock(ReceivableValidation.class);
  private final IBatchService batches = mock(IBatchService.class);
  private final UUID assignor = UUID.randomUUID();
  private final ImportServiceImpl service =
      new ImportServiceImpl(
          List.of(new CsvImportParser(), new CnabImportParser()),
          repository,
          validation,
          batches,
          Clock.fixed(Instant.parse("2026-09-27T12:00:00Z"), ZoneOffset.UTC));

  @BeforeEach
  void setup() {
    when(repository.assignors(anySet()))
        .thenReturn(
            List.of(new ImportRepository.AssignorLookup(assignor, "Cedente", "11222333000181")));
    when(repository.existing(anyList())).thenReturn(Set.of());
  }

  @Test
  void previewValidatesWithoutPersisting() throws Exception {
    var preview = service.preview(fixture("recebiveis.csv"), "CSV");
    assertEquals(2, preview.itemCount());
    assertEquals("3500.00", preview.faceValueBrl());
    verify(validation).validate(anyList(), eq(true));
    verifyNoInteractions(batches);
  }

  @Test
  void invalidPreviewPreservesOnlyValidRowsAndNeverImportsPartial() throws Exception {
    String csv =
        new String(fixture("recebiveis.csv").getBytes(), StandardCharsets.UTF_8)
            .replace("2500.00", "25,00");
    var file =
        new MockMultipartFile("file", "file.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));
    var error = assertThrows(ImportException.class, () -> service.create(file, "CSV", null));
    assertEquals(1, error.failure().preview().items().size());
    assertEquals(3, error.failure().details().getFirst().line());
    assertEquals("faceValueBrl", error.failure().details().getFirst().field());
    verifyNoInteractions(batches);
  }

  @Test
  void duplicateExistingIdentityRejectsWholeFile() throws Exception {
    when(repository.existing(anyList()))
        .thenReturn(
            Set.of(ImportRepository.identity(assignor, "DUPLICATA_MERCANTIL", "EXEMPLO-CSV-01")));
    var error =
        assertThrows(
            ImportException.class, () -> service.preview(fixture("recebiveis.csv"), "CSV"));
    assertEquals(1, error.failure().preview().items().size());
    verifyNoInteractions(batches);
  }

  @Test
  void rejectsOversizeBeforeReadingBytes() throws Exception {
    var file = mock(MultipartFile.class);
    when(file.isEmpty()).thenReturn(false);
    when(file.getSize()).thenReturn(5L * 1024 * 1024 + 1);
    assertEquals(
        413, assertThrows(ApiException.class, () -> service.preview(file, "CSV")).status());
    verify(file, never()).getBytes();
    verifyNoInteractions(batches);
  }

  @Test
  void confirmationReparsesCnabAndAppliesOnlyExplicitCurrency() throws Exception {
    when(batches.importItems(anyList(), eq("CNAB"))).thenReturn(Map.of("status", "READY"));
    service.create(
        fixture("recebiveis.cnab"), "CNAB", List.of(new PaymentCurrencyChoice(0, "USD")));
    verify(batches)
        .importItems(
            argThat(
                items ->
                    items.size() == 1
                        && items.getFirst().paymentCurrency().equals("USD")
                        && items.getFirst().faceValueBrl().equals("1000.00")),
            eq("CNAB"));
  }

  private MockMultipartFile fixture(String name) throws Exception {
    try (var input = getClass().getResourceAsStream("/import/" + name)) {
      return new MockMultipartFile("file", name, "application/octet-stream", input.readAllBytes());
    }
  }
}
