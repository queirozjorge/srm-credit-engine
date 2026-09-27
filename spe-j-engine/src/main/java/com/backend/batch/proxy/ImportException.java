package com.backend.batch.proxy;

import com.backend.batch.dto.ImportFailure;

public class ImportException extends RuntimeException {
  private final ImportFailure failure;

  public ImportException(ImportFailure failure) {
    super(failure.message());
    this.failure = failure;
  }

  public ImportFailure failure() {
    return failure;
  }
}
