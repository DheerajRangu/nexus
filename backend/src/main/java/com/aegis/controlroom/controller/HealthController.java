package com.aegis.controlroom.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class HealthController {

    private final JdbcTemplate jdbc;
    private final Environment environment;

    public HealthController(JdbcTemplate jdbc, @Autowired Environment environment) {
        this.jdbc = jdbc;
        this.environment = environment;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("service", "aegis-controlroom-backend");
        body.put("profiles", environment.getActiveProfiles());
        Integer flyway = jdbc.queryForObject(
                "SELECT COALESCE(MAX(installed_rank),0) FROM flyway_schema_history", Integer.class);
        body.put("flywayInstalledRank", flyway);
        Long users = jdbc.queryForObject("SELECT COUNT(*) FROM users", Long.class);
        body.put("seedUsers", users);
        return ResponseEntity.ok(body);
    }
}
