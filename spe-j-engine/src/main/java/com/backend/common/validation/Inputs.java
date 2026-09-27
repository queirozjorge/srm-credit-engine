package com.backend.common.validation;

import com.backend.common.exceptions.ApiException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Set;

public final class Inputs {
  private Inputs() {}

  public static ApiException invalid(String message) {
    return new ApiException(400, "REQUISICAO_INVALIDA", message);
  }

  public static ApiException data(String message) {
    return new ApiException(422, "DADOS_INVALIDOS", message);
  }

  public static ApiException missing() {
    return new ApiException(404, "RECURSO_NAO_ENCONTRADO", "Recurso não encontrado.");
  }

  public static String text(String value, int max, String field) {
    if (value == null || value.trim().isEmpty() || value.trim().length() > max)
      throw data("Informe " + field + " válido.");
    return value.trim();
  }

  public static long version(String value) {
    if (value == null || !value.matches("0|[1-9][0-9]{0,18}")) throw invalid("Versão inválida.");
    try {
      return Long.parseLong(value);
    } catch (NumberFormatException ex) {
      throw invalid("Versão inválida.");
    }
  }

  public static void pagination(int page, int size) {
    if (page < 1 || size < 1 || size > 100)
      throw new ApiException(400, "PAGINACAO_INVALIDA", "Página ou tamanho inválido.");
  }

  public static String choice(String value, Set<String> choices) {
    if (value == null || !choices.contains(value)) throw invalid("Opção inválida.");
    return value;
  }

  public static BigDecimal money(String value) {
    if (value == null || !value.matches("(0|[1-9][0-9]{0,16})\\.[0-9]{2}"))
      throw data("Valor monetário inválido.");
    var amount = new BigDecimal(value);
    if (amount.signum() <= 0) throw data("O valor de face deve ser positivo.");
    return amount;
  }

  public static void total(BigDecimal value) {
    if (value.abs().compareTo(new BigDecimal("99999999999999999.99")) > 0)
      throw new ApiException(
          422, "LIMITE_NUMERICO_EXCEDIDO", "O valor ultrapassa o limite permitido.");
  }

  public static LocalDate date(String value) {
    try {
      if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))
        throw invalid("Data inválida.");
      var date = LocalDate.parse(value);
      if (date.getYear() < 1) throw invalid("Data inválida.");
      return date;
    } catch (java.time.DateTimeException ex) {
      throw invalid("Data inválida.");
    }
  }
}
