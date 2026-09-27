package com.backend.batch.model;

import com.backend.common.model.MutableEntity;
import com.backend.common.security.Actor;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "batch")
public class Batch extends MutableEntity {
  private UUID activeRequestUuid;
  private String source;
  private String status;
  private int itemCount, readyCount, pendingCount, settledCount, failedCount;
  private String createdByIssuer, createdBySubject;

  protected Batch() {}

  public Batch(UUID id, Instant now, String source, int count, Actor actor) {
    super(id, now);
    this.source = source;
    this.status = "READY";
    this.itemCount = count;
    this.readyCount = count;
    this.createdByIssuer = actor.issuer();
    this.createdBySubject = actor.subject();
  }
}
