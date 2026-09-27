package com.backend.register.model;

import com.backend.common.model.MutableEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "assignor")
public class Assignor extends MutableEntity {
  private String documentNumber;
  private String name;
  private boolean deleted;

  protected Assignor() {}

  public Assignor(UUID uuid, Instant now, String document, String name) {
    super(uuid, now);
    this.documentNumber = document;
    this.name = name;
  }

  public String getDocumentNumber() {
    return documentNumber;
  }

  public String getName() {
    return name;
  }

  public boolean isDeleted() {
    return deleted;
  }

  public void rename(String name, Instant now) {
    this.name = name;
    markUpdated(now);
  }
}
