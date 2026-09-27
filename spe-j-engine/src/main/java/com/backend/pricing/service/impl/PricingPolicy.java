package com.backend.pricing.service.impl;

import com.backend.common.pricing.PricingEngine;
import java.math.BigDecimal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PricingPolicy {
  private final BigDecimal baseRate;

  public PricingPolicy(@Value("${engine.pricing.base-rate:0.01}") String baseRate) {
    this.baseRate = new BigDecimal(baseRate);
    PricingEngine.checkRate(this.baseRate, false);
  }

  public BigDecimal baseRate() {
    return baseRate;
  }
}
