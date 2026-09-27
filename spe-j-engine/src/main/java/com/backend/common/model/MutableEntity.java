package com.backend.common.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@MappedSuperclass
public abstract class MutableEntity extends BaseEntity {
    @Version
    @Column(nullable = false)
    protected long version;
    @Column(name = "date_updated")
    protected Instant dateUpdated;

    protected MutableEntity() { }
    protected MutableEntity(UUID uuid, Instant dateRegister) { super(uuid, dateRegister); }
    public long getVersion() { return version; }
    public Instant getDateUpdated() { return dateUpdated; }
    public void markUpdated(Instant instant) { dateUpdated = instant; }
}
