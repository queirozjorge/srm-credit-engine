package com.backend.common.pricing;

import java.math.BigDecimal;

public interface SpreadStrategy {
  String type();

  BigDecimal spread();
}
