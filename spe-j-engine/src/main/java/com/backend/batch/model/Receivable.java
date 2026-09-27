package com.backend.batch.model;

import com.backend.batch.dto.ReceivableInput;
import com.backend.common.model.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "receivable")
public class Receivable extends BaseEntity {
  private UUID batchUuid, assignorUuid;
  private String externalReference, type, paymentCurrency;

  @Column(precision = 19, scale = 2)
  private BigDecimal faceValueBrl;

  private LocalDate dueDate;

  protected Receivable() {}

  public Receivable(UUID id, UUID batch, Instant now, ReceivableInput input) {
    super(id, now);
    batchUuid = batch;
    assignorUuid = input.assignorUuid();
    externalReference = input.externalReference();
    type = input.type();
    paymentCurrency = input.paymentCurrency();
    faceValueBrl = new BigDecimal(input.faceValueBrl());
    dueDate = LocalDate.parse(input.dueDate());
  }
}
