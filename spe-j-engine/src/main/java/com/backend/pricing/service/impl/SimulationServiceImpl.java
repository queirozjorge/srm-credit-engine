package com.backend.pricing.service.impl;

import com.backend.batch.dto.ReceivableInput;
import com.backend.batch.repository.BatchQueryRepository;
import com.backend.batch.service.impl.ReceivableValidation;
import com.backend.common.dto.Views;
import com.backend.common.pricing.PricingEngine;
import com.backend.common.validation.Inputs;
import com.backend.exchange.service.IExchangeService;
import com.backend.pricing.dto.SimulationInput;
import com.backend.pricing.service.ISimulationService;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SimulationServiceImpl implements ISimulationService {
  private final BatchQueryRepository batches;
  private final ReceivableValidation validation;
  private final PricingEngine pricing;
  private final PricingPolicy policy;
  private final IExchangeService exchange;
  private final Clock clock;

  public SimulationServiceImpl(
      BatchQueryRepository batches,
      ReceivableValidation validation,
      PricingEngine pricing,
      PricingPolicy policy,
      IExchangeService exchange,
      Clock clock) {
    this.batches = batches;
    this.validation = validation;
    this.pricing = pricing;
    this.policy = policy;
    this.exchange = exchange;
    this.clock = clock;
  }

  public Object simulate(SimulationInput input) {
    if ((input.batchUuid() == null) == (input.items() == null)
        || input.batchUuid() == null && input.receivableUuids() != null)
      throw Inputs.invalid("Informe somente um lote ou uma lista de títulos.");
    var ids = new ArrayList<UUID>();
    List<ReceivableInput> items;
    if (input.batchUuid() != null) {
      var batch = batches.detail(input.batchUuid());
      var status = batch.get("status");
      var selection = input.receivableUuids();
      if ("READY".equals(status) && selection != null)
        throw Inputs.invalid("A simulação inicial deve incluir todos os títulos do lote.");
      if ("PENDING".equals(status) || "SETTLED".equals(status))
        throw Inputs.data("O lote não está disponível para simulação.");
      if (!"READY".equals(status) && selection == null)
        throw Inputs.invalid("Selecione os títulos falhos para simulação.");
      if (selection != null
          && (selection.isEmpty()
              || selection.size() > 1000
              || selection.contains(null)
              || new HashSet<>(selection).size() != selection.size()))
        throw Inputs.invalid("Seleção de títulos inválida.");
      var selected = batches.selected(input.batchUuid(), selection);
      if (selection != null && selected.size() != selection.size())
        throw Inputs.data("A seleção contém títulos de outro lote.");
      items = new ArrayList<>();
      for (var row : selected) {
        var processing = (Map<?, ?>) row.get("processing");
        if (!"READY".equals(status) && !"FAILED".equals(processing.get("status")))
          throw Inputs.data("Selecione somente títulos falhos.");
        ids.add((UUID) row.get("uuid"));
        items.add(
            new ReceivableInput(
                (UUID) row.get("assignorUuid"),
                (String) row.get("externalReference"),
                (String) row.get("type"),
                (String) row.get("faceValueBrl"),
                row.get("dueDate").toString(),
                (String) row.get("paymentCurrency")));
      }
    } else items = validation.validate(input.items(), true);
    var now = clock.instant();
    var date = now.atZone(ZoneId.of("America/Sao_Paulo")).toLocalDate();
    var quote =
        items.stream().anyMatch(i -> i.paymentCurrency().equals("USD"))
            ? exchange.requireQuote(now)
            : null;
    var totals = new FinancialAccumulator();
    var results = new ArrayList<Map<String, Object>>();
    int index = 0;
    for (var item : items) {
      var face = new BigDecimal(item.faceValueBrl());
      var result =
          pricing.calculate(
              face,
              item.type(),
              item.paymentCurrency(),
              LocalDate.parse(item.dueDate()),
              date,
              policy.baseRate(),
              quote == null ? null : new BigDecimal(quote.rate()));
      totals.add(face, item.paymentCurrency(), result);
      var view =
          Views.of(
              "itemIndex",
              index,
              "days",
              result.days(),
              "spread",
              result.spread().toPlainString(),
              "termMonths",
              result.termMonths().toPlainString(),
              "presentValueBrl",
              result.presentValueBrl().toPlainString(),
              "discountBrl",
              result.discountBrl().toPlainString(),
              "paymentCurrency",
              item.paymentCurrency(),
              "paymentValue",
              result.paymentValue().toPlainString());
      if (!ids.isEmpty()) view.put("receivableUuid", ids.get(index));
      results.add(view);
      index++;
    }
    return Views.of(
        "calculatedAt",
        now,
        "calculationDate",
        date,
        "indicative",
        true,
        "calculationVersion",
        PricingEngine.RULE_VERSION,
        "baseRate",
        policy.baseRate().toPlainString(),
        "exchangeRate",
        quote,
        "totals",
        totals.view(),
        "items",
        results);
  }
}
