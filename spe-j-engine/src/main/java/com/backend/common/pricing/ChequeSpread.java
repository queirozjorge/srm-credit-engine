package com.backend.common.pricing;

import java.math.BigDecimal;
import org.springframework.stereotype.Component;

@Component
public final class ChequeSpread implements SpreadStrategy {
  public String type() {
    return "CHEQUE_PRE_DATADO";
  }

  public BigDecimal spread() {
    return new BigDecimal("0.025");
  }
}
