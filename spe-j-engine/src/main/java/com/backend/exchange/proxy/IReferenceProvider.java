package com.backend.exchange.proxy;

import java.math.BigDecimal;

public interface IReferenceProvider {
  BigDecimal fetch();
}
