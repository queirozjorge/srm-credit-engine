package com.backend.common.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/** Builds named transport projections without exposing persistence entities. */
public final class Views {
  private Views() {}

  public static Map<String, Object> of(Object... pairs) {
    var values = new LinkedHashMap<String, Object>();
    for (int i = 0; i < pairs.length; i += 2) values.put((String) pairs[i], pairs[i + 1]);
    return values;
  }
}
