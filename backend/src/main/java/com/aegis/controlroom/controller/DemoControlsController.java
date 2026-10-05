package com.aegis.controlroom.controller;

import com.aegis.controlroom.service.DemoResetService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/demo")
public class DemoControlsController {

    private final DemoResetService demoResetService;

    public DemoControlsController(DemoResetService demoResetService) {
        this.demoResetService = demoResetService;
    }

    @PostMapping("/reset")
    public ResponseEntity<Map<String, String>> resetSystem() {
        demoResetService.resetAllOperationalData();
        return ResponseEntity.ok(Map.of("message", "System operational state reset to clean seed baseline."));
    }

    @PostMapping("/scenarios/full-hospitals")
    public ResponseEntity<Map<String, String>> injectFullHospitals() {
        demoResetService.injectScenarioFullHospitals();
        return ResponseEntity.ok(Map.of("message", "Scenario injected: All hospital beds exhausted."));
    }

    @PostMapping("/scenarios/no-ambulances")
    public ResponseEntity<Map<String, String>> injectNoAmbulances() {
        demoResetService.injectScenarioNoAvailableAmbulances();
        return ResponseEntity.ok(Map.of("message", "Scenario injected: All ambulances busy."));
    }
}
