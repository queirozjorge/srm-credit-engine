package com.backend.common.pricing;

import java.math.BigDecimal;
import org.springframework.stereotype.Component;

@Component
public final class DuplicataSpread implements SpreadStrategy {
  public String type() {
    return "DUPLICATA_MERCANTIL";
  }

  public BigDecimal spread() {
    return new BigDecimal("0.015");
  }
}
