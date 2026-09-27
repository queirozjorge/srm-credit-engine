package com.backend.batch.service;

import com.backend.batch.dto.*;
import java.util.List;
import java.util.Map;
import org.springframework.web.multipart.MultipartFile;

public interface IImportService {
  ImportPreview preview(MultipartFile file, String format);

  Map<String, Object> create(
      MultipartFile file, String format, List<PaymentCurrencyChoice> currencies);
}
