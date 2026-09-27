package com.backend.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class TimeConfiguration {
    public static final ZoneId FINANCIAL_ZONE = ZoneId.of("America/Sao_Paulo");
    @Bean
    Clock applicationClock() { return Clock.systemUTC(); }
}
