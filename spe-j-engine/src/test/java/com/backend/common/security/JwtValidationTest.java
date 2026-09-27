package com.backend.common.security;

import static org.junit.jupiter.api.Assertions.*;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import java.time.Instant;
import java.util.Date;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtException;

class JwtValidationTest {
  @Test
  void validatesSignatureIssuerAudienceExpiryAndNotBefore() throws Exception {
    RSAKey key = new RSAKeyGenerator(2048).keyID("key").generate();
    var decoder =
        org.springframework.security.oauth2.jwt.NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey())
            .signatureAlgorithm(
                org.springframework.security.oauth2.jose.jws.SignatureAlgorithm.RS256)
            .build();
    decoder.setJwtValidator(
        SecurityConfiguration.validators("https://public/realms/credit", "spe-j-engine"));
    Instant now = Instant.now();
    assertEquals(
        "actor",
        decoder
            .decode(
                token(
                    key,
                    "https://public/realms/credit",
                    "spe-j-engine",
                    now.plusSeconds(600),
                    now.minusSeconds(60),
                    JWSAlgorithm.RS256))
            .getSubject());
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    key,
                    "https://public/realms/credit",
                    "spe-j-engine",
                    null,
                    now.minusSeconds(60),
                    JWSAlgorithm.RS256)));
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    key,
                    "https://public/realms/credit",
                    null,
                    now.plusSeconds(600),
                    now.minusSeconds(60),
                    JWSAlgorithm.RS256)));
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    key,
                    "https://wrong",
                    "spe-j-engine",
                    now.plusSeconds(600),
                    now.minusSeconds(60),
                    JWSAlgorithm.RS256)));
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    key,
                    "https://public/realms/credit",
                    "other-api",
                    now.plusSeconds(600),
                    now.minusSeconds(60),
                    JWSAlgorithm.RS256)));
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    key,
                    "https://public/realms/credit",
                    "spe-j-engine",
                    now.minusSeconds(30),
                    now.minusSeconds(1200),
                    JWSAlgorithm.RS256)));
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    key,
                    "https://public/realms/credit",
                    "spe-j-engine",
                    now.plusSeconds(1200),
                    now.plusSeconds(30),
                    JWSAlgorithm.RS256)));
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    new RSAKeyGenerator(2048).keyID("key").generate(),
                    "https://public/realms/credit",
                    "spe-j-engine",
                    now.plusSeconds(600),
                    now.minusSeconds(60),
                    JWSAlgorithm.RS256)));
    assertThrows(
        JwtException.class,
        () ->
            decoder.decode(
                token(
                    key,
                    "https://public/realms/credit",
                    "spe-j-engine",
                    now.plusSeconds(600),
                    now.minusSeconds(60),
                    JWSAlgorithm.RS512)));
  }

  private String token(
      RSAKey key,
      String issuer,
      String audience,
      Instant expiry,
      Instant before,
      JWSAlgorithm algorithm)
      throws Exception {
    var claims =
        new JWTClaimsSet.Builder()
            .issuer(issuer)
            .subject("actor")
            .audience(audience)
            .issueTime(Date.from(before))
            .expirationTime(expiry == null ? null : Date.from(expiry))
            .notBeforeTime(Date.from(before))
            .build();
    var token = new SignedJWT(new JWSHeader.Builder(algorithm).keyID("key").build(), claims);
    token.sign(new RSASSASigner(key));
    return token.serialize();
  }
}
