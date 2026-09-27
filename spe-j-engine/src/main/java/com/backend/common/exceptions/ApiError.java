package com.backend.common.exceptions;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(
    String code, String message, List<FieldIssue> details, Map<String, String> context) {}
