package com.backend.batch.repository;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Repository;

@Repository
public class BatchWriteRepository {
  private final EntityManager entityManager;

  public BatchWriteRepository(EntityManager entityManager) {
    this.entityManager = entityManager;
  }

  public void insert(Object entity) {
    entityManager.persist(entity);
  }

  public void flush() {
    entityManager.flush();
  }
}
