package com.backend.common.pricing;

import static org.junit.jupiter.api.Assertions.*;

import com.backend.common.exceptions.ApiException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class PricingEngineTest {
  private final PricingEngine engine =
      new PricingEngine(List.of(new DuplicataSpread(), new ChequeSpread()));
  private final LocalDate today = LocalDate.of(2026, 9, 27);

  private PricingResult calculate(
      String face, String type, int days, String currency, String exchange) {
    return engine.calculate(
        new BigDecimal(face),
        type,
        currency,
        today.plusDays(days),
        today,
        new BigDecimal("0.01"),
        exchange == null ? null : new BigDecimal(exchange));
  }

  @Test
  void matchesGoldenCases() {
    assertEquals(
        new BigDecimal("92859.94"),
        calculate("100000.00", "DUPLICATA_MERCANTIL", 90, "BRL", null).paymentValue());
    assertEquals(
        new BigDecimal("23337.77"),
        calculate("25000.00", "CHEQUE_PRE_DATADO", 60, "BRL", null).paymentValue());
    var dollar = calculate("100000.00", "DUPLICATA_MERCANTIL", 90, "USD", "5.4321");
    assertEquals(new BigDecimal("17094.67"), dollar.paymentValue());
    assertEquals(new BigDecimal("7140.06"), dollar.discountBrl());
  }

  @Test
  void handlesFractionalMonthWithoutBinaryFloatingPoint() {
    var result = calculate("1000.00", "DUPLICATA_MERCANTIL", 15, "BRL", null);
    var expected =
        new BigDecimal("1000")
            .divide(new BigDecimal("1.025").sqrt(PricingEngine.PRECISION), PricingEngine.PRECISION)
            .setScale(2, java.math.RoundingMode.HALF_EVEN);
    assertEquals(expected, result.presentValueBrl());
    assertEquals(new BigDecimal("0.5"), result.termMonths());
    var identity = DecimalPower.exp(DecimalPower.log(new BigDecimal("1.025")));
    assertTrue(
        identity.subtract(new BigDecimal("1.025")).abs().compareTo(new BigDecimal("1E-48")) < 0);
  }

  @Test
  void zeroDaysStillRequiresDollarQuote() {
    assertEquals(
        new BigDecimal("1000.00"),
        calculate("1000.00", "CHEQUE_PRE_DATADO", 0, "BRL", null).paymentValue());
    assertEquals(
        "COTACAO_AUSENTE",
        assertThrows(
                ApiException.class, () -> calculate("1000.00", "CHEQUE_PRE_DATADO", 0, "USD", null))
            .code());
  }

  @Test
  void rejectsExpiredTitlesAndConvertedOverflow() {
    assertEquals(
        "VENCIMENTO_INVALIDO",
        assertThrows(
                ApiException.class,
                () -> calculate("1000.00", "CHEQUE_PRE_DATADO", -1, "BRL", null))
            .code());
    assertEquals(
        "LIMITE_NUMERICO_EXCEDIDO",
        assertThrows(
                ApiException.class,
                () ->
                    calculate(
                        "99999999999999999.99", "CHEQUE_PRE_DATADO", 0, "USD", "0.000000000001"))
            .code());
  }

  @Test
  void preservesExactHalfEvenTiesForIntegerMonths() {
    var result =
        engine.calculate(
            new BigDecimal("3.00"),
            "DUPLICATA_MERCANTIL",
            "BRL",
            today.plusDays(30),
            today,
            new BigDecimal("0.585"),
            null);
    assertEquals(new BigDecimal("1.88"), result.paymentValue());
    result =
        engine.calculate(
            new BigDecimal("1.00"),
            "DUPLICATA_MERCANTIL",
            "BRL",
            today.plusDays(30),
            today,
            new BigDecimal("0.585"),
            null);
    assertEquals(new BigDecimal("0.62"), result.paymentValue());
  }

  @Test
  void allowsContractualNegativeBaseWhenCalculationBaseRemainsPositive() {
    var result =
        engine.calculate(
            new BigDecimal("1000.00"),
            "DUPLICATA_MERCANTIL",
            "BRL",
            today.plusDays(30),
            today,
            new BigDecimal("-0.02"),
            null);
    assertEquals(new BigDecimal("1005.03"), result.paymentValue());
    assertEquals(new BigDecimal("-5.03"), result.discountBrl());
  }
}
