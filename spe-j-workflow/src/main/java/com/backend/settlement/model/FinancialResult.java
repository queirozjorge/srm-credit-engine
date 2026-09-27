package com.backend.settlement.model;

import java.math.BigDecimal;

public record FinancialResult(BigDecimal presentValueBrl, BigDecimal discountBrl, BigDecimal paymentValue) {}
