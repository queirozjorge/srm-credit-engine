package com.backend.common.exceptions;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class TransportConfigurationTest {
  record Input(String value) {}

  @Test
  void rejectsNumericDecimalAndUnknownFields() {
    var builder = JsonMapper.builder();
    new TransportConfiguration().strictInput().customize(builder);
    var mapper = builder.build();
    assertThrows(Exception.class, () -> mapper.readValue("{\"value\":12.5}", Input.class));
    assertThrows(
        Exception.class, () -> mapper.readValue("{\"value\":\"12.5\",\"other\":1}", Input.class));
    assertEquals("12.5", mapper.readValue("{\"value\":\"12.5\"}", Input.class).value());
  }
}
