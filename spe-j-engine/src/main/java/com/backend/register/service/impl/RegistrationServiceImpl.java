package com.backend.register.service.impl;

import com.backend.common.audit.AuditService;
import com.backend.common.dto.PageResponse;
import com.backend.common.dto.Views;
import com.backend.common.exceptions.ApiException;
import com.backend.common.validation.Inputs;
import com.backend.register.dto.AssignorInput;
import com.backend.register.model.Assignor;
import com.backend.register.repository.AssignorRepository;
import com.backend.register.service.IRegistrationService;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class RegistrationServiceImpl implements IRegistrationService {
  private final AssignorRepository repository;
  private final AuditService audit;
  private final Clock clock;

  public RegistrationServiceImpl(AssignorRepository repository, AuditService audit, Clock clock) {
    this.repository = repository;
    this.audit = audit;
    this.clock = clock;
  }

  public Object list(String q, boolean active, int page, int size) {
    Inputs.pagination(page, size);
    var result =
        repository.search(
            q.trim(),
            active,
            PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "dateRegister", "uuid")));
    return PageResponse.of(
        result.getContent().stream().map(this::view).toList(),
        page,
        size,
        result.getTotalElements());
  }

  public Object get(UUID uuid) {
    return view(repository.findById(uuid).orElseThrow(Inputs::missing));
  }

  @Transactional
  public UUID create(AssignorInput.Create input) {
    var name = Inputs.text(input.name(), 150, "um nome");
    if (!Cnpj.valid(input.documentNumber())) throw Inputs.data("CNPJ inválido.");
    if (repository.findByDocumentNumber(input.documentNumber()).isPresent())
      throw new ApiException(409, "DOCUMENTO_DUPLICADO", "Já existe um cedente com esse CNPJ.");
    var entity =
        repository.saveAndFlush(
            new Assignor(UUID.randomUUID(), clock.instant(), input.documentNumber(), name));
    audit.record(
        "ASSIGNOR_CREATED",
        Map.of("assignor_uuid", entity.getUuid()),
        Views.of("name", name, "documentNumber", input.documentNumber()));
    return entity.getUuid();
  }

  @Transactional
  public void update(UUID uuid, AssignorInput.Patch input) {
    var name = Inputs.text(input.name(), 150, "um nome");
    var version = Inputs.version(input.version());
    var entity = repository.findById(uuid).orElseThrow(Inputs::missing);
    if (entity.getVersion() != version)
      throw new ApiException(
          409, "VERSAO_DESATUALIZADA", "O cadastro foi alterado. Consulte os dados atuais.");
    var previous = entity.getName();
    entity.rename(name, clock.instant());
    repository.flush();
    audit.record(
        "ASSIGNOR_UPDATED",
        Map.of("assignor_uuid", uuid),
        Views.of("name", Views.of("previous", previous, "current", name)));
  }

  private Object view(Assignor a) {
    return Views.of(
        "uuid",
        a.getUuid(),
        "name",
        a.getName(),
        "documentNumber",
        a.getDocumentNumber(),
        "deleted",
        a.isDeleted(),
        "version",
        Long.toString(a.getVersion()),
        "registeredAt",
        a.getDateRegister(),
        "updatedAt",
        a.getDateUpdated());
  }
}
