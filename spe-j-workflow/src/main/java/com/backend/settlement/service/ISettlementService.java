package com.backend.settlement.service;

import com.backend.settlement.dto.SettlementCommand;
import com.backend.settlement.model.ProcessingOutcome;

public interface ISettlementService {
    ProcessingOutcome process(SettlementCommand command);
}
