package com.backend.outbox.service;

public interface IOutboxRelay {
    void publishNext();
}
