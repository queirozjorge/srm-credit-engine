package com.backend.common.security;

import com.backend.common.exceptions.ApiError;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.json.JsonMapper;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {
  @Bean
  JwtDecoder jwtDecoder(
      @Value("${engine.security.issuer-uri}") String issuer,
      @Value("${engine.security.jwk-set-uri}") String jwks,
      @Value("${engine.security.audience}") String audience) {
    var decoder =
        NimbusJwtDecoder.withJwkSetUri(jwks).jwsAlgorithm(SignatureAlgorithm.RS256).build();
    decoder.setJwtValidator(validators(issuer, audience));
    return decoder;
  }

  static OAuth2TokenValidator<Jwt> validators(String issuer, String audience) {
    OAuth2TokenValidator<Jwt> audienceAndIdentity =
        jwt ->
            jwt.getAudience() != null
                    && jwt.getAudience().contains(audience)
                    && jwt.getSubject() != null
                    && !jwt.getSubject().isBlank()
                    && jwt.getExpiresAt() != null
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
    return new DelegatingOAuth2TokenValidator<>(
        new JwtTimestampValidator(java.time.Duration.ZERO),
        new JwtIssuerValidator(issuer),
        audienceAndIdentity);
  }

  @Bean
  SecurityFilterChain apiSecurity(HttpSecurity http, JsonMapper mapper) throws Exception {
    var converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(
        jwt -> {
          Object realm = jwt.getClaims().get("realm_access");
          Object roles = realm instanceof Map<?, ?> map ? map.get("roles") : null;
          if (!(roles instanceof Collection<?> collection)) return List.of();
          return collection.stream()
              .filter(role -> "OPERADOR".equals(role) || "GESTOR".equals(role))
              .<org.springframework.security.core.GrantedAuthority>map(
                  role -> new SimpleGrantedAuthority("ROLE_" + role))
              .toList();
        });
    http.csrf(csrf -> csrf.disable())
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            authorize ->
                authorize
                    .requestMatchers(
                        "/actuator/**", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                    .permitAll()
                    .requestMatchers(
                        HttpMethod.POST,
                        "/batches",
                        "/batches/**",
                        "/simulations",
                        "/exchange/proposals")
                    .hasRole("OPERADOR")
                    .requestMatchers(HttpMethod.PATCH, "/exchange/proposals/**")
                    .hasRole("GESTOR")
                    .anyRequest()
                    .hasAnyRole("OPERADOR", "GESTOR"))
        .oauth2ResourceServer(
            oauth ->
                oauth
                    .jwt(jwt -> jwt.jwtAuthenticationConverter(converter))
                    .authenticationEntryPoint(
                        (request, response, error) -> {
                          response.setStatus(401);
                          response.setContentType("application/json;charset=UTF-8");
                          mapper.writeValue(
                              response.getOutputStream(),
                              new ApiError(
                                  "SESSAO_INVALIDA",
                                  "Sessão inválida. Entre novamente.",
                                  null,
                                  null));
                        }))
        .exceptionHandling(
            errors ->
                errors.accessDeniedHandler(
                    (request, response, error) -> {
                      response.setStatus(403);
                      response.setContentType("application/json;charset=UTF-8");
                      mapper.writeValue(
                          response.getOutputStream(),
                          new ApiError(
                              "ACESSO_NEGADO",
                              "Você não possui permissão para esta operação.",
                              null,
                              null));
                    }));
    return http.build();
  }
}
