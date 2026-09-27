package com.backend.common.security;

import com.backend.common.exceptions.ApiException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

@Component
public class ActorProvider {
  public Actor current() {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !(authentication.getPrincipal() instanceof Jwt jwt))
      throw new ApiException(401, "SESSAO_INVALIDA", "Sessão inválida. Entre novamente.");
    return new Actor(jwt.getClaimAsString("iss"), jwt.getSubject(), displayName(jwt));
  }

  private String displayName(Jwt jwt) {
    String name = jwt.getClaimAsString("name");
    if (name == null || name.isBlank()) {
      String givenName = jwt.getClaimAsString("given_name");
      String familyName = jwt.getClaimAsString("family_name");
      name = ((givenName == null ? "" : givenName.trim()) + " "
              + (familyName == null ? "" : familyName.trim()))
          .trim();
    }
    if (name.isBlank()) name = jwt.getClaimAsString("preferred_username");
    if (name == null || name.isBlank()) return null;
    String normalized = name.trim();
    return normalized.length() <= 150 ? normalized : normalized.substring(0, 150).trim();
  }
}
