package com.backend.common.pricing;

import java.math.BigDecimal;

public record PricingResult(
    int days,
    BigDecimal termMonths,
    BigDecimal spread,
    BigDecimal presentValueBrl,
    BigDecimal discountBrl,
    BigDecimal paymentValue) {}
