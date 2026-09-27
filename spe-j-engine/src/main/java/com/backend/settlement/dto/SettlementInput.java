package com.backend.settlement.dto;

import java.util.List;
import java.util.UUID;

public record SettlementInput(List<UUID> receivableUuids, String reason) {}
