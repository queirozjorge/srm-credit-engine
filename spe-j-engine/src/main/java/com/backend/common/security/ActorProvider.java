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
    return new Actor(jwt.getClaimAsString("iss"), jwt.getSubject());
  }
}
