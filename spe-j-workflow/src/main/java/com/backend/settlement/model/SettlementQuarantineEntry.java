package com.backend.settlement.model;

public record SettlementQuarantineEntry(
        String sourceTopic,
        int sourcePartition,
        long sourceOffset,
        String keySha256,
        int keySizeBytes,
        String valueSha256,
        int valueSizeBytes,
        String failureCode) {}
