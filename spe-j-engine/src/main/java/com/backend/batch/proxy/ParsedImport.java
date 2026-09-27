package com.backend.batch.proxy;

import com.backend.common.exceptions.FieldIssue;
import java.util.List;

public record ParsedImport(List<RawImportRow> rows, List<FieldIssue> issues) {}
