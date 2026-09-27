package com.backend.batch.dto;

import com.backend.common.exceptions.FieldIssue;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ImportFailure(
    String code,
    String message,
    List<FieldIssue> details,
    Preview preview,
    Boolean detailsTruncated) {
  public record Preview(String source, List<ImportPreviewItem> items) {}
}
