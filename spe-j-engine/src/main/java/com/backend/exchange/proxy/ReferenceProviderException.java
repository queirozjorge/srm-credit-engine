package com.backend.exchange.proxy;

public class ReferenceProviderException extends RuntimeException {
  private final boolean transientFailure;

  public ReferenceProviderException(String message, boolean transientFailure, Throwable cause) {
    super(message, cause);
    this.transientFailure = transientFailure;
  }

  public boolean transientFailure() {
    return transientFailure;
  }
}
