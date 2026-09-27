package com.backend.batch.proxy;

import com.backend.common.exceptions.FieldIssue;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/** FEBRABAN 240 v11.0, section 3.2.2: inbound collection lots 060, paired P/Q only. */
@Component
public class CnabImportParser implements ImportParser {
  private static final DateTimeFormatter DATE =
      DateTimeFormatter.ofPattern("ddMMuuuu").withResolverStyle(ResolverStyle.STRICT);

  public String format() {
    return "CNAB";
  }

  public ParsedImport parse(String content) {
    String[] lines = content.split("\\r?\\n", -1);
    int length = lines.length;
    if (length > 0 && lines[length - 1].isEmpty()) length--;
    if (length < 6) throw problem("Estrutura CNAB incompleta.", 1);
    for (int i = 0; i < length; i++) {
      if (lines[i].length() != 240 || !lines[i].chars().allMatch(c -> c >= 32 && c <= 126))
        throw problem("Cada registro CNAB deve conter 240 posições ASCII.", i + 1);
    }
    String header = lines[0], trailer = lines[length - 1], bank = field(header, 1, 3);
    require(
        bank.matches("[0-9]{3}")
            && field(header, 4, 8).equals("00000")
            && field(header, 143, 143).equals("1")
            && field(header, 164, 166).equals("103"),
        "Header de arquivo ou versão CNAB incompatível.",
        1);
    require(field(trailer, 1, 8).equals(bank + "99999"), "Trailer de arquivo inválido.", length);
    require(
        number(trailer, 24, 29, length) == length,
        "Contagem de registros do arquivo divergente.",
        length);
    List<RawImportRow> rows = new ArrayList<>();
    List<FieldIssue> issues = new ArrayList<>();
    int i = 1, lots = 0, itemIndex = 0;
    while (i < length - 1) {
      int lotStart = i, line = i + 1;
      String lot = lines[i++], lotId = field(lot, 4, 7);
      require(
          field(lot, 1, 3).equals(bank)
              && number(lot, 4, 7, line) == ++lots
              && field(lot, 8, 16).equals("1R01  060")
              && field(lot, 18, 18).equals("2"),
          "Header de lote fora do perfil de cobrança aceito.",
          line);
      String document = field(lot, 19, 33).trim();
      if (document.length() == 15 && document.startsWith("0")) document = document.substring(1);
      require(document.matches("[0-9]{14}"), "Documento do cedente inválido.", line);
      int sequence = 1, count = 0;
      while (i < length - 1 && field(lines[i], 8, 8).equals("3")) {
        int pLine = i + 1;
        String p = lines[i++];
        validateDetail(p, bank, lotId, sequence++, "P", pLine);
        require(i < length - 1, "Segmento Q ausente.", pLine);
        String q = lines[i++];
        validateDetail(q, bank, lotId, sequence++, "Q", i);
        if (itemIndex >= 1000) throw problem("O arquivo excede o limite de 1.000 títulos.", pLine);
        try {
          rows.add(parseItem(p, document, pLine, itemIndex));
        } catch (ParserProblem error) {
          issues.add(
              new FieldIssue("ARQUIVO_INVALIDO", error.getMessage(), null, itemIndex, pLine));
        }
        itemIndex++;
        count++;
      }
      require(count > 0 && i < length - 1, "Lote sem títulos ou trailer ausente.", i + 1);
      String end = lines[i++];
      require(
          field(end, 1, 8).equals(bank + lotId + "5") && number(end, 18, 23, i) == i - lotStart,
          "Trailer ou contagem de registros do lote divergente.",
          i);
    }
    require(number(trailer, 18, 23, length) == lots, "Contagem de lotes divergente.", length);
    return new ParsedImport(List.copyOf(rows), List.copyOf(issues));
  }

  private RawImportRow parseItem(String p, String document, int pLine, int itemIndex) {
    require(field(p, 228, 229).equals("09"), "O título CNAB deve estar expresso em reais.", pLine);
    String species = field(p, 107, 108);
    require(
        species.equals("01") || species.equals("02"), "Espécie de título não suportada.", pLine);
    require(
        field(p, 118, 118).equals("3")
            && field(p, 119, 141).matches("0{23}")
            && field(p, 142, 195).matches("0{54}"),
        "Juros, descontos, IOF e abatimentos não são aceitos neste perfil.",
        pLine);
    String due;
    try {
      due = LocalDate.parse(field(p, 78, 85), DATE).toString();
    } catch (java.time.DateTimeException error) {
      throw problem("Vencimento CNAB inválido.", pLine);
    }
    String nominal = field(p, 86, 100);
    require(nominal.matches("[0-9]{15}"), "Valor nominal CNAB inválido.", pLine);
    return new RawImportRow(
        document,
        field(p, 63, 77).trim(),
        species.equals("01") ? "CHEQUE_PRE_DATADO" : "DUPLICATA_MERCANTIL",
        new BigDecimal(nominal).movePointLeft(2).toPlainString(),
        due,
        "BRL",
        pLine,
        itemIndex);
  }

  private void validateDetail(
      String row, String bank, String lot, int sequence, String segment, int line) {
    require(
        field(row, 1, 8).equals(bank + lot + "3")
            && number(row, 9, 13, line) == sequence
            && field(row, 14, 14).equals(segment)
            && field(row, 16, 17).equals("01"),
        "Sequência, segmento ou movimento CNAB incompatível; somente entrada de títulos é aceita.",
        line);
  }

  private int number(String row, int start, int end, int line) {
    String value = field(row, start, end);
    require(value.matches("[0-9]+"), "Contagem ou sequência CNAB inválida.", line);
    return Integer.parseInt(value);
  }

  private String field(String value, int start, int end) {
    return value.substring(start - 1, end);
  }

  private void require(boolean valid, String message, int line) {
    if (!valid) throw problem(message, line);
  }

  private ParserProblem problem(String message, int line) {
    return new ParserProblem(message, line);
  }
}
