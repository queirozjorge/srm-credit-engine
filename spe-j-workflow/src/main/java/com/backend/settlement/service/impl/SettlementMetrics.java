package com.backend.settlement.service.impl;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

@Component
public class SettlementMetrics {
    private final MeterRegistry registry;
    public SettlementMetrics(MeterRegistry registry) { this.registry=registry; }
    public void outcome(String outcome) { registry.counter("workflow.settlement.outcomes","outcome",outcome).increment(); }
    public void duration(long nanos) { registry.timer("workflow.settlement.duration").record(nanos,TimeUnit.NANOSECONDS); }
}
