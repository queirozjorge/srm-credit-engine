package com.backend.exchange.service.impl;

import com.backend.common.exceptions.ApiException;
import com.backend.common.pricing.PricingEngine;
import com.backend.exchange.dto.ExchangeReference;
import com.backend.exchange.proxy.IReferenceProvider;
import com.backend.exchange.proxy.ReferenceProviderException;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.util.concurrent.*;
import org.springframework.stereotype.Service;

@Service
public class ReferenceService {
  private final IReferenceProvider provider;
  private final Clock clock;
  private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

  public ReferenceService(IReferenceProvider provider, Clock clock) {
    this.provider = provider;
    this.clock = clock;
  }

  public ExchangeReference fetch() {
    Throwable cause = null;
    for (int attempt = 0; attempt < 3; attempt++) {
      Future<java.math.BigDecimal> call = executor.submit(provider::fetch);
      try {
        var rate = call.get(2, TimeUnit.SECONDS);
        PricingEngine.checkRate(rate, true);
        return new ExchangeReference(rate.stripTrailingZeros().toPlainString(), clock.instant());
      } catch (InterruptedException error) {
        call.cancel(true);
        Thread.currentThread().interrupt();
        cause = error;
        break;
      } catch (ApiException error) {
        cause = error;
        break;
      } catch (ExecutionException | TimeoutException error) {
        call.cancel(true);
        cause = error;
        boolean retryable =
            error instanceof TimeoutException
                || error.getCause() instanceof ReferenceProviderException providerError
                    && providerError.transientFailure();
        if (!retryable) break;
        if (attempt < 2) {
          try {
            Thread.sleep(attempt == 0 ? 500 : 1000);
          } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            cause = interrupted;
            break;
          }
        }
      }
    }
    var error =
        new ApiException(
            503,
            "REFERENCIA_CAMBIAL_INDISPONIVEL",
            "A referência cambial está indisponível. Você pode informar a cotação manualmente.");
    error.initCause(cause);
    throw error;
  }

  @PreDestroy
  public void stop() {
    executor.shutdownNow();
  }
}
