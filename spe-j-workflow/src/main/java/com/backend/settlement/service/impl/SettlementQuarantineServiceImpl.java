package com.backend.settlement.service.impl;

import com.backend.settlement.model.SettlementQuarantineEntry;
import com.backend.settlement.repository.SettlementQuarantineRepository;
import com.backend.settlement.service.ISettlementQuarantineService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class SettlementQuarantineServiceImpl implements ISettlementQuarantineService {
    private final SettlementQuarantineRepository repository;
    private final TransactionTemplate transaction;

    public SettlementQuarantineServiceImpl(SettlementQuarantineRepository repository, PlatformTransactionManager manager) {
        this.repository = repository;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setTimeout(10);
    }

    @Override
    public void quarantine(SettlementQuarantineEntry entry) {
        transaction.executeWithoutResult(status -> repository.insertIfAbsent(entry));
    }
}
