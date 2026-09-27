package com.backend.batch.proxy;

import com.backend.common.exceptions.FieldIssue;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class CsvImportParser implements ImportParser {
  private static final List<String> HEADER =
      List.of(
          "cedente_documento",
          "referencia_externa",
          "tipo",
          "valor_face",
          "vencimento",
          "moeda_pagamento");

  public String format() {
    return "CSV";
  }

  public ParsedImport parse(String content) {
    List<RawImportRow> rows = new ArrayList<>();
    List<FieldIssue> issues = new ArrayList<>();
    List<String> fields = new ArrayList<>();
    StringBuilder value = new StringBuilder();
    boolean quoted = false, closed = false, header = false;
    int line = 1, startLine = 1, records = 0;
    for (int i = 0; i <= content.length(); i++) {
      char c = i == content.length() ? '\n' : content.charAt(i);
      if (quoted) {
        if (i == content.length())
          throw new ParserProblem("Aspas não encerradas no CSV.", startLine);
        if (c == '"') {
          if (i + 1 < content.length() && content.charAt(i + 1) == '"') {
            value.append('"');
            i++;
          } else {
            quoted = false;
            closed = true;
          }
        } else {
          value.append(c);
          if (c == '\n') line++;
        }
        continue;
      }
      if (c == '"' && value.isEmpty() && !closed) {
        quoted = true;
        continue;
      }
      if (c == '\r' && i + 1 < content.length() && content.charAt(i + 1) == '\n') continue;
      if (c == ';' || c == '\n') {
        fields.add(value.toString());
        value.setLength(0);
        closed = false;
        if (c == ';') continue;
        if (i == content.length() && fields.size() == 1 && fields.getFirst().isEmpty()) break;
        if (!header) {
          if (!fields.equals(HEADER))
            throw new ParserProblem("Cabeçalho CSV incompatível com o formato aceito.", startLine);
          header = true;
        } else {
          if (++records > 1000)
            throw new ParserProblem("O arquivo excede o limite de 1.000 títulos.", startLine);
          if (fields.size() != 6)
            issues.add(
                new FieldIssue(
                    "ARQUIVO_INVALIDO",
                    "A linha deve conter seis campos.",
                    null,
                    records - 1,
                    startLine));
          else
            rows.add(
                new RawImportRow(
                    fields.get(0),
                    fields.get(1),
                    fields.get(2),
                    fields.get(3),
                    fields.get(4),
                    fields.get(5),
                    startLine,
                    records - 1));
        }
        fields.clear();
        line++;
        startLine = line;
      } else {
        if (closed || c == '"' || c == '\r')
          throw new ParserProblem("Escape ou quebra de linha inválidos no CSV.", line);
        value.append(c);
      }
    }
    if (!header || records == 0)
      throw new ParserProblem("O arquivo deve conter pelo menos um título.", 1);
    return new ParsedImport(List.copyOf(rows), List.copyOf(issues));
  }
}
