package com.aegis.dispatch.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.UUID;

@RestControllerAdvice
public class ApiErrorAdvice {
  record ErrorBody(String code, String message, String correlationId, Instant occurredAt) {}
  @ExceptionHandler(ApiException.class)
  ResponseEntity<ErrorBody> api(ApiException e, HttpServletRequest request) { return response(e.status(), e.code(), e.getMessage()); }
  @ExceptionHandler(Exception.class)
  ResponseEntity<ErrorBody> other(Exception e) { return response(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,"INTERNAL_ERROR","The operation could not be completed."); }
  private ResponseEntity<ErrorBody> response(org.springframework.http.HttpStatus status,String code,String message){return ResponseEntity.status(status).body(new ErrorBody(code,message,UUID.randomUUID().toString(),Instant.now()));}
}
