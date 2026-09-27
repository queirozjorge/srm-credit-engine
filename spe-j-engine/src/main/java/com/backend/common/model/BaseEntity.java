package com.backend.common.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@MappedSuperclass
public abstract class BaseEntity {
    @Id
    @Column(nullable = false, updatable = false)
    protected UUID uuid;
    @Column(name = "date_register", nullable = false, updatable = false)
    protected Instant dateRegister;

    protected BaseEntity() { }
    protected BaseEntity(UUID uuid, Instant dateRegister) {
        this.uuid = uuid;
        this.dateRegister = dateRegister;
    }
    public UUID getUuid() { return uuid; }
    public Instant getDateRegister() { return dateRegister; }
}
