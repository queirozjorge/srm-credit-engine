package com.backend.settlement.model;

import java.math.BigDecimal;

public record PricingSnapshot(BigDecimal faceValue, String receivableType, String paymentCurrency,
        int termDays, BigDecimal baseRate, BigDecimal spread, BigDecimal exchangeRate,
        String ruleVersion, String termConvention, String calculationPolicy, String roundingPolicy) {}
