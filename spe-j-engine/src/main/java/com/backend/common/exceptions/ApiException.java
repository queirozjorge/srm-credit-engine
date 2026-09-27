package com.backend.common.exceptions;

import java.util.List;
import java.util.Map;

public class ApiException extends RuntimeException {
  private final int status;
  private final String code;
  private final List<FieldIssue> details;
  private final Map<String, String> context;

  public ApiException(int status, String code, String message) {
    this(status, code, message, null, null);
  }

  public ApiException(
      int status,
      String code,
      String message,
      List<FieldIssue> details,
      Map<String, String> context) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.context = context;
  }

  public int status() {
    return status;
  }

  public String code() {
    return code;
  }

  public ApiError error() {
    return new ApiError(code, getMessage(), details, context);
  }
}
