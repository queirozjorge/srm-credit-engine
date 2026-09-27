package com.backend.batch.dto;

import java.util.List;

public record ImportPreview(
    String source, int itemCount, String faceValueBrl, List<ImportPreviewItem> items) {}
