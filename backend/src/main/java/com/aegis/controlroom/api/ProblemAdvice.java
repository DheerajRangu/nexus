package com.aegis.controlroom.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import com.aegis.controlroom.routing.RoutingProviderUnavailableException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ProblemAdvice {

    @ExceptionHandler(DomainConflictException.class)
    public ResponseEntity<Map<String, Object>> conflict(DomainConflictException ex, HttpServletRequest req) {
        return problem(HttpStatus.CONFLICT, ex.getMessage(), req.getRequestURI());
    }

    @ExceptionHandler(RoutingProviderUnavailableException.class)
    public ResponseEntity<Map<String, Object>> routingUnavailable(RoutingProviderUnavailableException ex, HttpServletRequest req) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage(), req.getRequestURI());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> status(ResponseStatusException ex, HttpServletRequest req) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        return problem(status, ex.getReason() != null ? ex.getReason() : status.getReasonPhrase(), req.getRequestURI());
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    public ResponseEntity<Map<String, Object>> badRequest(RuntimeException ex, HttpServletRequest req) {
        return problem(HttpStatus.BAD_REQUEST, ex.getMessage(), req.getRequestURI());
    }

    private static ResponseEntity<Map<String, Object>> problem(HttpStatus status, String detail, String instance) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "about:blank");
        body.put("title", status.getReasonPhrase());
        body.put("status", status.value());
        body.put("detail", detail);
        body.put("instance", instance);
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(body);
    }
}
