package com.backend.batch.service.impl;

import com.backend.batch.dto.*;
import com.backend.batch.proxy.*;
import com.backend.batch.repository.ImportRepository;
import com.backend.batch.service.IBatchService;
import com.backend.batch.service.IImportService;
import com.backend.common.exceptions.*;
import com.backend.common.validation.Inputs;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ImportServiceImpl implements IImportService {
  private final Map<String, ImportParser> parsers;
  private final ImportRepository repository;
  private final ReceivableValidation validation;
  private final IBatchService batches;
  private final Clock clock;

  public ImportServiceImpl(
      List<ImportParser> parsers,
      ImportRepository repository,
      ReceivableValidation validation,
      IBatchService batches,
      Clock clock) {
    this.parsers =
        parsers.stream().collect(Collectors.toMap(ImportParser::format, Function.identity()));
    this.repository = repository;
    this.validation = validation;
    this.batches = batches;
    this.clock = clock;
  }

  @Override
  @Transactional(readOnly = true)
  public ImportPreview preview(MultipartFile file, String format) {
    return read(file, format);
  }

  @Override
  @Transactional
  public Map<String, Object> create(
      MultipartFile file, String format, List<PaymentCurrencyChoice> currencies) {
    var preview = read(file, format);
    List<ReceivableInput> items =
        new ArrayList<>(preview.items().stream().map(ImportPreviewItem::input).toList());
    if (currencies != null) {
      if (!"CNAB".equals(format)) throw bad("A escolha de moeda é permitida somente para CNAB.");
      Set<Integer> seen = new HashSet<>();
      for (var choice : currencies) {
        if (choice == null
            || choice.itemIndex() == null
            || choice.itemIndex() < 0
            || choice.itemIndex() >= items.size()
            || !seen.add(choice.itemIndex())
            || !Set.of("BRL", "USD").contains(Objects.toString(choice.paymentCurrency(), "")))
          throw bad("Seleção de moeda ou índice inválido.");
        var old = items.get(choice.itemIndex());
        items.set(
            choice.itemIndex(),
            new ReceivableInput(
                old.assignorUuid(),
                old.externalReference(),
                old.type(),
                old.faceValueBrl(),
                old.dueDate(),
                choice.paymentCurrency()));
      }
    }
    return batches.importItems(items, format);
  }

  private ImportPreview read(MultipartFile file, String format) {
    var parser = parsers.get(format);
    if (parser == null) throw bad("Formato de arquivo inválido. Selecione CSV ou CNAB.");
    if (file == null || file.isEmpty())
      throw invalid(format, List.of(issue("O arquivo está vazio.", null, null, 1)), List.of());
    if (file.getSize() > 5L * 1024 * 1024)
      throw new ApiException(413, "ARQUIVO_MUITO_GRANDE", "O arquivo excede o limite de 5 MiB.");
    ParsedImport parsed;
    try {
      String content =
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(file.getBytes()))
              .toString();
      if (content.startsWith("\uFEFF")) content = content.substring(1);
      parsed = parser.parse(content);
    } catch (ParserProblem error) {
      throw invalid(
          format, List.of(issue(error.getMessage(), null, null, error.line())), List.of());
    } catch (java.io.IOException error) {
      var failure =
          invalid(
              format,
              List.of(issue("Não foi possível ler o arquivo UTF-8.", null, null, 1)),
              List.of());
      failure.initCause(error);
      throw failure;
    }
    Set<String> documents =
        parsed.rows().stream()
            .map(row -> row.document().replaceAll("[^0-9]", ""))
            .collect(Collectors.toSet());
    var assignors =
        repository.assignors(documents).stream()
            .collect(
                Collectors.toMap(ImportRepository.AssignorLookup::document, Function.identity()));
    List<FieldIssue> issues = new ArrayList<>(parsed.issues());
    List<ImportPreviewItem> valid = new ArrayList<>();
    Set<String> identities = new HashSet<>();
    var today = LocalDate.now(clock.withZone(ZoneId.of("America/Sao_Paulo")));
    BigDecimal total = BigDecimal.ZERO;
    for (var row : parsed.rows()) {
      int before = issues.size();
      var assignor = assignors.get(row.document().replaceAll("[^0-9]", ""));
      if (!row.document().trim().matches("[0-9./-]+")
          || !com.backend.register.service.impl.Cnpj.valid(row.document().replaceAll("[^0-9]", "")))
        issues.add(
            issue("Documento do cedente inválido.", "assignorUuid", row.itemIndex(), row.line()));
      if (assignor == null)
        issues.add(
            issue("Cedente inexistente ou inativo.", "assignorUuid", row.itemIndex(), row.line()));
      String reference =
          validate(
              issues,
              row,
              "externalReference",
              () -> Inputs.text(row.reference(), 1000, "uma referência externa"));
      String type =
          validate(
              issues,
              row,
              "type",
              () -> {
                Inputs.choice(row.type(), Set.of("DUPLICATA_MERCANTIL", "CHEQUE_PRE_DATADO"));
                return row.type();
              });
      String currency =
          validate(
              issues,
              row,
              "paymentCurrency",
              () -> {
                Inputs.choice(row.currency(), Set.of("BRL", "USD"));
                return row.currency();
              });
      String amount =
          validate(
              issues,
              row,
              "faceValueBrl",
              () -> {
                if (!row.amount().matches("[0-9]+\\.[0-9]{2}"))
                  throw Inputs.data("Informe valor decimal com duas casas.");
                return Inputs.money(row.amount()).toPlainString();
              });
      String due =
          validate(
              issues,
              row,
              "dueDate",
              () -> {
                var date = Inputs.date(row.dueDate());
                if (date.isBefore(today)) throw Inputs.data("O título está vencido.");
                return date.toString();
              });
      if (before == issues.size()) {
        String identity = ImportRepository.identity(assignor.uuid(), type, reference);
        if (!identities.add(identity)) {
          issues.add(
              issue(
                  "Título repetido no arquivo.", "externalReference", row.itemIndex(), row.line()));
          continue;
        }
        valid.add(
            new ImportPreviewItem(
                row.itemIndex(),
                row.line(),
                assignor.name(),
                assignor.uuid(),
                reference,
                type,
                amount,
                due,
                currency));
        total = total.add(new BigDecimal(amount));
      }
    }
    var existing = repository.existing(valid.stream().map(ImportPreviewItem::input).toList());
    valid.removeIf(
        item -> {
          if (!existing.contains(
              ImportRepository.identity(
                  item.assignorUuid(), item.type(), item.externalReference()))) return false;
          issues.add(
              issue(
                  "Este título já está cadastrado.",
                  "externalReference",
                  item.itemIndex(),
                  item.line()));
          return true;
        });
    try {
      Inputs.total(total);
    } catch (ApiException error) {
      issues.add(issue(error.getMessage(), "faceValueBrl", null, null));
    }
    if (valid.isEmpty() && issues.isEmpty())
      issues.add(issue("O arquivo deve conter pelo menos um título.", null, null, 1));
    if (!issues.isEmpty()) throw invalid(format, issues, valid);
    validation.validate(valid.stream().map(ImportPreviewItem::input).toList(), true);
    return new ImportPreview(
        format, valid.size(), total.setScale(2).toPlainString(), List.copyOf(valid));
  }

  private String validate(
      List<FieldIssue> issues,
      RawImportRow row,
      String field,
      java.util.function.Supplier<String> supplier) {
    try {
      return supplier.get();
    } catch (ApiException error) {
      issues.add(
          new FieldIssue(error.code(), error.getMessage(), field, row.itemIndex(), row.line()));
      return null;
    }
  }

  private FieldIssue issue(String message, String field, Integer item, Integer line) {
    return new FieldIssue("ARQUIVO_INVALIDO", message, field, item, line);
  }

  private ImportException invalid(
      String source, List<FieldIssue> issues, List<ImportPreviewItem> valid) {
    return new ImportException(
        new ImportFailure(
            "ARQUIVO_INVALIDO",
            "Confira os erros do arquivo antes de importar.",
            List.copyOf(issues.subList(0, Math.min(issues.size(), 1000))),
            new ImportFailure.Preview(source, List.copyOf(valid)),
            issues.size() > 1000 ? Boolean.TRUE : null));
  }

  private ApiException bad(String message) {
    return new ApiException(400, "REQUISICAO_INVALIDA", message);
  }
}
