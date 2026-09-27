package com.backend.common.exceptions;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(com.backend.batch.proxy.ImportException.class)
  ResponseEntity<com.backend.batch.dto.ImportFailure> importError(
      com.backend.batch.proxy.ImportException error) {
    log("ARQUIVO_INVALIDO", error);
    return ResponseEntity.unprocessableEntity().body(error.failure());
  }

  @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
  ResponseEntity<ApiError> tooLarge(Exception error) {
    return response(413, "ARQUIVO_MUITO_GRANDE", "O arquivo excede o limite de 5 MiB.", error);
  }

  @ExceptionHandler(ApiException.class)
  ResponseEntity<ApiError> business(ApiException error) {
    log(error.code(), error);
    return ResponseEntity.status(error.status()).body(error.error());
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class,
    ConstraintViolationException.class,
    MethodArgumentNotValidException.class,
    org.springframework.web.bind.MissingRequestHeaderException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class,
    org.springframework.web.multipart.support.MissingServletRequestPartException.class
  })
  ResponseEntity<ApiError> malformed(Exception error) {
    return response(
        400, "REQUISICAO_INVALIDA", "Confira o formato e os campos da requisição.", error);
  }

  @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
  ResponseEntity<ApiError> absent(Exception error) {
    return response(404, "ROTA_INEXISTENTE", "A rota solicitada não existe.", error);
  }

  @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
  ResponseEntity<ApiError> method(Exception error) {
    return response(
        405, "REQUISICAO_INVALIDA", "Método HTTP não permitido para esta operação.", error);
  }

  @ExceptionHandler(org.springframework.web.HttpMediaTypeNotSupportedException.class)
  ResponseEntity<ApiError> media(Exception error) {
    return response(
        415, "REQUISICAO_INVALIDA", "Tipo de conteúdo não suportado para esta operação.", error);
  }

  @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
  ResponseEntity<ApiError> conflict(Exception error) {
    return response(
        409, "VERSAO_DESATUALIZADA", "Os dados foram alterados. Atualize a consulta.", error);
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<ApiError> integrity(DataIntegrityViolationException error) {
    for (Throwable cause = error; cause != null; cause = cause.getCause()) {
      if (cause instanceof java.sql.SQLException sql && "23505".equals(sql.getSQLState())) {
        String message = String.valueOf(sql.getMessage());
        if (message.contains("assignor_document_number_key"))
          return response(
              409, "DOCUMENTO_DUPLICADO", "Já existe um cedente com este documento.", error);
        if (message.contains("receivable_assignor_uuid_type_external_reference_key"))
          return response(409, "RECEBIVEL_DUPLICADO", "Este título já está cadastrado.", error);
      }
    }
    return unexpected(error);
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<ApiError> denied(Exception error) {
    return response(403, "ACESSO_NEGADO", "Você não possui permissão para esta operação.", error);
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> unexpected(Exception error) {
    return response(
        500, "ERRO_INTERNO", "Não foi possível concluir a operação. Tente novamente.", error);
  }

  private ResponseEntity<ApiError> response(
      int status, String code, String message, Exception error) {
    log(code, error);
    return ResponseEntity.status(status).body(new ApiError(code, message, null, null));
  }

  private void log(String code, Exception error) {
    var event = LOG.atError().addKeyValue("code", code).addKeyValue("operation", "http_request");
    if (error instanceof ApiException api && api.error().context() != null)
      api.error().context().forEach(event::addKeyValue);
    event.setCause(error).log("[handler]:[error]: {} - {}", code, error.getMessage());
  }
}
