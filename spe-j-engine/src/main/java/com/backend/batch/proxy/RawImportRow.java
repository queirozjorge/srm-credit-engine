package com.backend.batch.proxy;

public record RawImportRow(
    String document,
    String reference,
    String type,
    String amount,
    String dueDate,
    String currency,
    int line,
    int itemIndex) {}
