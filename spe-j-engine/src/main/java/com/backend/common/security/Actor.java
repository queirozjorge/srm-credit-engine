package com.backend.common.security;

public record Actor(String issuer, String subject, String displayName) {
  public Actor(String issuer, String subject) {
    this(issuer, subject, null);
  }

  public boolean sameIdentity(Actor other) {
    return other != null && issuer.equals(other.issuer) && subject.equals(other.subject);
  }
}
