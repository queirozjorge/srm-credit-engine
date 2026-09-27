package com.backend.batch.dto;

import java.util.UUID;

public record ReceivableInput(
    UUID assignorUuid,
    String externalReference,
    String type,
    String faceValueBrl,
    String dueDate,
    String paymentCurrency) {}
