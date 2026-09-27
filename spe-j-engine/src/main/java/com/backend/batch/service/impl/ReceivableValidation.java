package com.backend.batch.service.impl;

import com.backend.batch.dto.ReceivableInput;
import com.backend.common.exceptions.ApiException;
import com.backend.common.validation.Inputs;
import com.backend.register.repository.AssignorRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.stereotype.Component;

@Component
public class ReceivableValidation {
  private final AssignorRepository assignors;
  private final Clock clock;

  public ReceivableValidation(AssignorRepository assignors, Clock clock) {
    this.assignors = assignors;
    this.clock = clock;
  }

  public List<ReceivableInput> validate(List<ReceivableInput> items, boolean checkDueDate) {
    if (items == null || items.isEmpty() || items.size() > 1000)
      throw Inputs.data("O lote deve conter entre 1 e 1.000 títulos.");
    var normalized = new ArrayList<ReceivableInput>();
    var identities = new HashSet<String>();
    var total = BigDecimal.ZERO;
    var ids = new HashSet<UUID>();
    for (var item : items) {
      if (item == null || item.assignorUuid() == null)
        throw Inputs.data("Informe o cedente de cada título.");
      ids.add(item.assignorUuid());
    }
    var active = new HashSet<UUID>();
    assignors
        .findAllById(ids)
        .forEach(
            a -> {
              if (!a.isDeleted()) active.add(a.getUuid());
            });
    var today = LocalDate.now(clock.withZone(ZoneId.of("America/Sao_Paulo")));
    for (var item : items) {
      if (!active.contains(item.assignorUuid()))
        throw Inputs.data("Cedente inexistente ou inativo.");
      var reference = Inputs.text(item.externalReference(), 1000, "uma referência externa");
      Inputs.choice(item.type(), Set.of("DUPLICATA_MERCANTIL", "CHEQUE_PRE_DATADO"));
      Inputs.choice(item.paymentCurrency(), Set.of("BRL", "USD"));
      var value = Inputs.money(item.faceValueBrl());
      total = total.add(value);
      Inputs.total(total);
      var due = Inputs.date(item.dueDate());
      if (checkDueDate && due.isBefore(today))
        throw new ApiException(
            422, "VENCIMENTO_INVALIDO", "O vencimento não pode ser anterior à data atual.");
      if (!identities.add(item.assignorUuid() + "/" + item.type() + "/" + reference))
        throw new ApiException(409, "RECEBIVEL_DUPLICADO", "Há títulos repetidos no lote.");
      normalized.add(
          new ReceivableInput(
              item.assignorUuid(),
              reference,
              item.type(),
              value.toPlainString(),
              due.toString(),
              item.paymentCurrency()));
    }
    return List.copyOf(normalized);
  }
}
