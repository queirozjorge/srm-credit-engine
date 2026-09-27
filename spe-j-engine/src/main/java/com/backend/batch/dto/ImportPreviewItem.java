package com.backend.batch.dto;

import java.util.UUID;

public record ImportPreviewItem(
    int itemIndex,
    int line,
    String assignorName,
    UUID assignorUuid,
    String externalReference,
    String type,
    String faceValueBrl,
    String dueDate,
    String paymentCurrency) {
  public ReceivableInput input() {
    return new ReceivableInput(
        assignorUuid, externalReference, type, faceValueBrl, dueDate, paymentCurrency);
  }
}
