package com.backend.register.dto;

public final class AssignorInput {
  private AssignorInput() {}

  public record Create(String name, String documentNumber) {}

  public record Patch(String name, String version) {}
}
