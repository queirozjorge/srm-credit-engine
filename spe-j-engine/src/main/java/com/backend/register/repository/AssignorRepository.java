package com.backend.register.repository;

import com.backend.register.model.Assignor;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AssignorRepository extends JpaRepository<Assignor, UUID> {
  Optional<Assignor> findByDocumentNumber(String document);

  @Query(
      "select a from Assignor a where (:active = false or a.deleted = false) and (:q = '' or"
          + " lower(a.name) like lower(concat('%',:q,'%')) or a.documentNumber like"
          + " concat('%',:q,'%'))")
  Page<Assignor> search(String q, boolean active, Pageable pageable);
}
