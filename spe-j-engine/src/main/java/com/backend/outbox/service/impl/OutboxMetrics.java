package com.backend.outbox.service.impl;

import com.backend.outbox.repository.OutboxRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.util.concurrent.TimeUnit;

@Component
public class OutboxMetrics {
    private final Counter published;
    private final Counter failures;
    private final Counter dlqPublished;
    private final Timer latency;
    public OutboxMetrics(MeterRegistry registry, OutboxRepository repository, Clock clock) {
        published=registry.counter("engine.outbox.published");
        failures=registry.counter("engine.outbox.failures");
        dlqPublished=registry.counter("engine.outbox.dlq.published");
        latency=registry.timer("engine.outbox.publish.duration");
        Gauge.builder("engine.outbox.oldest.age", repository, r -> r.oldestAgeSeconds(clock.instant()))
            .baseUnit("seconds").description("Idade da mensagem mais antiga ainda não confirmada.").register(registry);
    }
    public void published(String topic) {
        published.increment();
        if (topic.endsWith(".dlq")) dlqPublished.increment();
    }
    public void failed() { failures.increment(); }
    public void duration(long elapsedNanos) { latency.record(elapsedNanos, TimeUnit.NANOSECONDS); }
}
