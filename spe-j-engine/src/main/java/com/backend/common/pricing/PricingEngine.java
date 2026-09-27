package com.backend.common.pricing;

import com.backend.common.exceptions.ApiException;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class PricingEngine {
  public static final MathContext PRECISION = new MathContext(50, RoundingMode.HALF_EVEN);
  public static final String RULE_VERSION = "1";
  public static final String TERM_CONVENTION = "ACTUAL_30";
  private final Map<String, SpreadStrategy> strategies;

  public PricingEngine(List<SpreadStrategy> strategies) {
    this.strategies =
        strategies.stream()
            .collect(Collectors.toUnmodifiableMap(SpreadStrategy::type, Function.identity()));
  }

  public PricingResult calculate(
      BigDecimal face,
      String type,
      String currency,
      LocalDate dueDate,
      LocalDate calculationDate,
      BigDecimal baseRate,
      BigDecimal exchangeRate) {
    if (face == null
        || face.signum() <= 0
        || face.scale() > 2
        || dueDate == null
        || calculationDate == null) throw invalid("Dados financeiros inválidos.");
    checkMoney(face);
    var strategy = strategies.get(type);
    if (strategy == null || !("BRL".equals(currency) || "USD".equals(currency)))
      throw invalid("Tipo ou moeda inválidos.");
    checkRate(baseRate, false);
    long daysLong = ChronoUnit.DAYS.between(calculationDate, dueDate);
    if (daysLong < 0) throw new ApiException(422, "VENCIMENTO_INVALIDO", "O título está vencido.");
    if (daysLong > Integer.MAX_VALUE) throw invalid("Prazo fora do limite permitido.");
    int days = (int) daysLong;
    var term = BigDecimal.valueOf(days).divide(new BigDecimal("30"), PRECISION);
    var base = BigDecimal.ONE.add(baseRate, PRECISION).add(strategy.spread(), PRECISION);
    if (base.signum() <= 0) throw invalid("A base do cálculo deve ser positiva.");
    var exponent = DecimalPower.log(base).multiply(term, PRECISION).negate();
    if (exponent.compareTo(new BigDecimal("1000")) > 0) throw overflow();
    BigDecimal present;
    if (exponent.compareTo(new BigDecimal("-1000")) < 0) present = BigDecimal.ZERO;
    else if (days % 30 == 0) present = face.divide(base.pow(days / 30, PRECISION), PRECISION);
    else present = face.multiply(DecimalPower.exp(exponent), PRECISION);
    present = present.setScale(2, RoundingMode.HALF_EVEN);
    checkMoney(present);
    var payment = present;
    if ("USD".equals(currency)) {
      if (exchangeRate == null)
        throw new ApiException(
            422, "COTACAO_AUSENTE", "Não há cotação vigente para pagamento em dólares.");
      checkRate(exchangeRate, true);
      payment = present.divide(exchangeRate, 2, RoundingMode.HALF_EVEN);
    }
    checkMoney(payment);
    var discount = face.subtract(present).setScale(2, RoundingMode.HALF_EVEN);
    checkMoney(discount);
    return new PricingResult(days, term, strategy.spread(), present, discount, payment);
  }

  public static void checkMoney(BigDecimal value) {
    if (value == null || value.abs().compareTo(new BigDecimal("99999999999999999.99")) > 0)
      throw overflow();
  }

  public static void checkRate(BigDecimal value, boolean positive) {
    if (value == null
        || value.scale() > 12
        || value.abs().compareTo(new BigDecimal("999999999999.999999999999")) > 0
        || positive && value.signum() <= 0)
      throw invalid("Taxa inválida ou fora do limite permitido.");
  }

  private static ApiException invalid(String message) {
    return new ApiException(422, "DADOS_INVALIDOS", message);
  }

  private static ApiException overflow() {
    return new ApiException(
        422, "LIMITE_NUMERICO_EXCEDIDO", "O valor excede o limite financeiro permitido.");
  }
}
