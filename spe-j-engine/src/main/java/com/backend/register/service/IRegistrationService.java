package com.backend.register.service;

import com.backend.register.dto.AssignorInput;
import java.util.UUID;

public interface IRegistrationService {
  Object list(String q, boolean activeOnly, int page, int size);

  Object get(UUID uuid);

  UUID create(AssignorInput.Create input);

  void update(UUID uuid, AssignorInput.Patch input);
}
