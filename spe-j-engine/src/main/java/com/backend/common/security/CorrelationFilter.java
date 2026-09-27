package com.backend.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class CorrelationFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String id = request.getHeader("X-Correlation-ID");
    if (id == null || !id.matches("[A-Za-z0-9_-]{1,100}")) id = UUID.randomUUID().toString();
    try {
      MDC.put("correlationId", id);
      response.setHeader("X-Correlation-ID", id);
      chain.doFilter(request, response);
    } finally {
      MDC.remove("correlationId");
    }
  }
}
