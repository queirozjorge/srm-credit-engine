package com.backend.batch.dto;

import java.util.List;

public record CreateBatch(List<ReceivableInput> items) {}
