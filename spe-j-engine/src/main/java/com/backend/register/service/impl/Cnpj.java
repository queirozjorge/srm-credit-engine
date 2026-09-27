package com.backend.register.service.impl;

public final class Cnpj {
  private Cnpj() {}

  public static boolean valid(String value) {
    if (value == null || !value.matches("[0-9]{14}") || value.chars().distinct().count() == 1)
      return false;
    return digit(value, 12) == value.charAt(12) - '0' && digit(value, 13) == value.charAt(13) - '0';
  }

  private static int digit(String value, int length) {
    int sum = 0, weight = 2;
    for (int i = length - 1; i >= 0; i--) {
      sum += (value.charAt(i) - '0') * weight;
      weight = weight == 9 ? 2 : weight + 1;
    }
    int remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }
}
