package com.backend.settlement.model;

import java.time.Duration;

public record ProcessingOutcome(boolean acknowledged, Duration retryAfter) {
    public static ProcessingOutcome complete() { return new ProcessingOutcome(true, Duration.ZERO); }
    public static ProcessingOutcome retry(Duration delay) {
        return new ProcessingOutcome(false, delay.isNegative() || delay.isZero() ? Duration.ofMillis(100) : delay);
    }
}
