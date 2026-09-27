package com.backend.batch.model;

import com.backend.common.model.MutableEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "receivable_processing")
public class ReceivableProcessing extends MutableEntity {
  private UUID receivableUuid, activeAttemptUuid;
  private String status;
  private int attemptNumber;

  @Column(insertable = false, updatable = false)
  private boolean hasError;

  protected ReceivableProcessing() {}

  public ReceivableProcessing(UUID id, UUID receivable, Instant now) {
    super(id, now);
    receivableUuid = receivable;
    status = "READY";
  }
}
