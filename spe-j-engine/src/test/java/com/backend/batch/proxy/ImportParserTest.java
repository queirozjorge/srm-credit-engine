package com.backend.batch.proxy;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class ImportParserTest {
  private String fixture(String name) throws Exception {
    try (var stream = getClass().getResourceAsStream("/import/" + name)) {
      return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  @Test
  void publicExamplesUseRealParsersAndNormalizedValues() throws Exception {
    var csv = new CsvImportParser().parse(fixture("recebiveis.csv"));
    var cnab = new CnabImportParser().parse(fixture("recebiveis.cnab"));
    assertEquals(2, csv.rows().size());
    assertEquals(1, cnab.rows().size());
    assertEquals("11222333000181", cnab.rows().getFirst().document());
    assertEquals("1000.00", cnab.rows().getFirst().amount());
    assertEquals("2030-12-31", cnab.rows().getFirst().dueDate());
    assertEquals(3, cnab.rows().getFirst().line());
  }

  @Test
  void csvEscapesQuotesSeparatorsAndTracksPhysicalLines() throws Exception {
    var header = fixture("recebiveis.csv").lines().findFirst().orElseThrow();
    var text =
        header
            + "\n"
            + "11222333000181;\"NF;\"\"001\"\"\n"
            + "parte\";DUPLICATA_MERCANTIL;1000.00;2030-12-31;BRL\n";
    var rows = new CsvImportParser().parse(text).rows();
    assertEquals("NF;\"001\"\nparte", rows.getFirst().reference());
    assertEquals(2, rows.getFirst().line());
    assertThrows(
        ParserProblem.class, () -> new CsvImportParser().parse(header + "\n\"unterminated"));
  }

  @Test
  void rejectsOtherCnabProfilesMovementAndAdditionalCharges() throws Exception {
    String cnab = fixture("recebiveis.cnab");
    assertThrows(
        ParserProblem.class, () -> new CnabImportParser().parse(replace(cnab, 0, 143, "2")));
    assertThrows(
        ParserProblem.class, () -> new CnabImportParser().parse(replace(cnab, 1, 14, "040")));
    assertThrows(
        ParserProblem.class, () -> new CnabImportParser().parse(replace(cnab, 2, 16, "02")));
    assertFalse(
        new CnabImportParser().parse(replace(cnab, 2, 127, "000000000000001")).issues().isEmpty());
    assertThrows(
        ParserProblem.class, () -> new CnabImportParser().parse(replace(cnab, 3, 14, "R")));
  }

  @Test
  void validatesCountsSequencesAndWidths() throws Exception {
    String cnab = fixture("recebiveis.cnab");
    assertThrows(
        ParserProblem.class, () -> new CnabImportParser().parse(replace(cnab, 5, 24, "000005")));
    assertThrows(
        ParserProblem.class, () -> new CnabImportParser().parse(replace(cnab, 4, 18, "000003")));
    assertThrows(
        ParserProblem.class, () -> new CnabImportParser().parse(replace(cnab, 3, 9, "00003")));
    assertThrows(ParserProblem.class, () -> new CnabImportParser().parse(cnab.substring(1)));
  }

  @Test
  void rejectsMoreThanThousandCsvItemsBeforeUnboundedPreview() throws Exception {
    var lines = fixture("recebiveis.csv").lines().toList();
    assertThrows(
        ParserProblem.class,
        () ->
            new CsvImportParser()
                .parse(lines.getFirst() + "\n" + (lines.get(1) + "\n").repeat(1001)));
  }

  private String replace(String original, int line, int start, String value) {
    var lines = original.split("\r\n");
    String old = lines[line];
    lines[line] = old.substring(0, start - 1) + value + old.substring(start - 1 + value.length());
    return String.join("\r\n", lines) + "\r\n";
  }
}
