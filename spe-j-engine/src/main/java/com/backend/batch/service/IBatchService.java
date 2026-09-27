package com.backend.batch.service;

import com.backend.batch.dto.CreateBatch;
import com.backend.batch.dto.ReceivableInput;
import java.util.*;

public interface IBatchService {
  Map<String, Object> create(CreateBatch input);

  Map<String, Object> importItems(List<ReceivableInput> items, String source);

  Object list(String q, String status, int page, int size);

  Object detail(UUID uuid);

  Object receivables(UUID uuid, String status, int page, int size);
}
