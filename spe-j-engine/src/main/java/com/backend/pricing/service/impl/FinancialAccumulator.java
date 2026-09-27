package com.backend.pricing.service.impl;

import com.backend.common.dto.Views;
import com.backend.common.pricing.PricingEngine;
import com.backend.common.pricing.PricingResult;
import java.math.BigDecimal;
import java.util.Map;

/**
 * Running sums are validated before committing the candidate, preserving earlier eligible items.
 */
public class FinancialAccumulator {
  private BigDecimal face = BigDecimal.ZERO,
      present = BigDecimal.ZERO,
      discount = BigDecimal.ZERO,
      brl = BigDecimal.ZERO,
      usd = BigDecimal.ZERO;

  public FinancialAccumulator() {}

  public FinancialAccumulator(Map<String, Object> totals) {
    face = decimal(totals, "faceValueBrl");
    present = decimal(totals, "presentValueBrl");
    discount = decimal(totals, "discountBrl");
    brl = decimal(totals, "paymentBrl");
    usd = decimal(totals, "paymentUsd");
  }

  private static BigDecimal decimal(Map<String, Object> totals, String key) {
    return new BigDecimal(totals.get(key).toString());
  }

  public void add(BigDecimal value, String currency, PricingResult result) {
    var nextFace = face.add(value);
    var nextPresent = present.add(result.presentValueBrl());
    var nextDiscount = discount.add(result.discountBrl());
    var nextBrl = brl.add("BRL".equals(currency) ? result.paymentValue() : BigDecimal.ZERO);
    var nextUsd = usd.add("USD".equals(currency) ? result.paymentValue() : BigDecimal.ZERO);
    for (var number : new BigDecimal[] {nextFace, nextPresent, nextDiscount, nextBrl, nextUsd})
      PricingEngine.checkMoney(number);
    face = nextFace;
    present = nextPresent;
    discount = nextDiscount;
    brl = nextBrl;
    usd = nextUsd;
  }

  public Map<String, Object> view() {
    return Views.of(
        "faceValueBrl",
        text(face),
        "presentValueBrl",
        text(present),
        "discountBrl",
        text(discount),
        "paymentBrl",
        text(brl),
        "paymentUsd",
        text(usd));
  }

  private static String text(BigDecimal value) {
    return value.setScale(2).toPlainString();
  }
}
