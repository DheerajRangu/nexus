package com.aegis.controlroom.controller;

import com.aegis.controlroom.service.DemoResetService;
import com.aegis.controlroom.service.DemoScenarioService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/demo")
@Profile("demo")
public class DemoControlsController {

    private final DemoResetService demoResetService;
    private final DemoScenarioService demoScenarioService;

    public DemoControlsController(DemoResetService demoResetService,
                                  DemoScenarioService demoScenarioService) {
        this.demoResetService = demoResetService;
        this.demoScenarioService = demoScenarioService;
    }

    @GetMapping("/status")
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(Map.of("enabled", true, "label", "Training data and simulated integrations"));
    }

    @PostMapping("/reset")
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public ResponseEntity<Map<String, Object>> resetSystem() {
        return ResponseEntity.ok(demoResetService.resetAllOperationalData());
    }

    @PostMapping("/run-scenario")
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public ResponseEntity<Map<String, Object>> runScenario() {
        return ResponseEntity.ok(demoScenarioService.runScenario());
    }

    @PostMapping("/inject")
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public ResponseEntity<Map<String, Object>> inject(@RequestBody Map<String, String> body) {
        String kind = body != null ? body.get("kind") : null;
        if (kind == null && body != null) {
            // allow {"driverRejection":true} style
            kind = body.keySet().stream().findFirst().orElse(null);
        }
        return ResponseEntity.ok(demoScenarioService.inject(kind));
    }
}
