package com.backend.common.pricing;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/** Decimal log/exp with guard digits; no binary floating point intermediates. */
final class DecimalPower {
  private static final MathContext GUARD = new MathContext(64, RoundingMode.HALF_EVEN);
  private static final BigDecimal TWO = new BigDecimal("2");
  private static final BigDecimal EPS = new BigDecimal("1E-63");

  private DecimalPower() {}

  static BigDecimal log(BigDecimal value) {
    int roots = 0;
    while (value.subtract(BigDecimal.ONE).abs().compareTo(new BigDecimal("0.1")) > 0) {
      value = value.sqrt(GUARD);
      roots++;
    }
    var z = value.subtract(BigDecimal.ONE).divide(value.add(BigDecimal.ONE), GUARD);
    var zSquared = z.multiply(z, GUARD);
    var power = z;
    var sum = z;
    for (int n = 3; n < 10000; n += 2) {
      power = power.multiply(zSquared, GUARD);
      var term = power.divide(BigDecimal.valueOf(n), GUARD);
      sum = sum.add(term, GUARD);
      if (term.abs().compareTo(EPS) < 0) break;
    }
    return sum.multiply(TWO.pow(roots + 1), GUARD);
  }

  static BigDecimal exp(BigDecimal value) {
    int squares = 0;
    while (value.abs().compareTo(new BigDecimal("0.1")) > 0) {
      value = value.divide(TWO, GUARD);
      squares++;
    }
    var sum = BigDecimal.ONE;
    var term = BigDecimal.ONE;
    for (int n = 1; n < 10000; n++) {
      term = term.multiply(value, GUARD).divide(BigDecimal.valueOf(n), GUARD);
      sum = sum.add(term, GUARD);
      if (term.abs().compareTo(EPS) < 0) break;
    }
    for (int n = 0; n < squares; n++) sum = sum.multiply(sum, GUARD);
    return sum.round(PricingEngine.PRECISION);
  }
}
