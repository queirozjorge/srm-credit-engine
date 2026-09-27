package com.backend.common.exceptions;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record FieldIssue(
    String code, String message, String field, Integer itemIndex, Integer line) {}
