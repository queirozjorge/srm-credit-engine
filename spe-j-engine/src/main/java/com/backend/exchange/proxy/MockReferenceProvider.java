package com.backend.exchange.proxy;

import java.math.BigDecimal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Reference only: never creates an approved exchange quote. */
@Component
public class MockReferenceProvider implements IReferenceProvider {
  private final BigDecimal rate;

  public MockReferenceProvider(@Value("${engine.exchange.reference.rate:5.4321}") BigDecimal rate) {
    this.rate = rate;
  }

  public BigDecimal fetch() {
    return rate;
  }
}
