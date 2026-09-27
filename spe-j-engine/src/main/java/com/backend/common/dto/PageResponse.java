package com.backend.common.dto;

import com.backend.common.exceptions.ApiException;
import java.util.List;

public record PageResponse<T>(List<T> items, int page, int size, long totalItems, long totalPages) {
  public static void validate(int page, int size) {
    if (page < 1 || size < 1 || size > 100)
      throw new ApiException(
          400, "PAGINACAO_INVALIDA", "Informe uma página positiva e tamanho entre 1 e 100.");
  }

  public static <T> PageResponse<T> of(List<T> items, int page, int size, long total) {
    validate(page, size);
    return new PageResponse<>(items, page, size, total, total == 0 ? 0 : 1 + (total - 1) / size);
  }
}
