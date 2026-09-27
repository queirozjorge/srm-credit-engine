package com.backend.settlement.dto;

import java.util.UUID;

public record AcceptanceResponse(int status, UUID requestUuid, Object body) {}
