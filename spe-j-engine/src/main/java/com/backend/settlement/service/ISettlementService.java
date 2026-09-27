package com.backend.settlement.service;

import com.backend.settlement.dto.*;
import java.util.UUID;

public interface ISettlementService {
  AcceptanceResponse accept(UUID batch, String key, SettlementInput input);
}
