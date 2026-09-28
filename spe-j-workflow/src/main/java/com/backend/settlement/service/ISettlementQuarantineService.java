package com.backend.settlement.service;

import com.backend.settlement.model.SettlementQuarantineEntry;

public interface ISettlementQuarantineService {
    void quarantine(SettlementQuarantineEntry entry);
}
