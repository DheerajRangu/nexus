package com.aegis.controlroom.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class RedactingRequestLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RedactingRequestLogFilter.class);

    static String format(String method, String uri, String query) {
        String line = method + " " + uri;
        if (query != null && !query.isBlank()) {
            line = line + "?" + query;
        }
        return LogRedactor.redact(line);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        log.info("{}", format(request.getMethod(), request.getRequestURI(), request.getQueryString()));
        filterChain.doFilter(request, response);
    }
}
