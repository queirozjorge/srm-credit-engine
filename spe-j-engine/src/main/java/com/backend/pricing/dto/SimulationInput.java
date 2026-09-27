package com.backend.pricing.dto;

import com.backend.batch.dto.ReceivableInput;
import java.util.List;
import java.util.UUID;

public record SimulationInput(
    UUID batchUuid, List<UUID> receivableUuids, List<ReceivableInput> items) {}
