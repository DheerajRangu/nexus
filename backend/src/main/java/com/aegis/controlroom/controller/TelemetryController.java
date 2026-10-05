package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.TelemetryPingDto;
import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.repository.AmbulanceRepository;
import com.aegis.controlroom.service.TelemetryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryController {

    private final TelemetryService telemetryService;
    private final AmbulanceRepository ambulanceRepository;

    public TelemetryController(TelemetryService telemetryService, AmbulanceRepository ambulanceRepository) {
        this.telemetryService = telemetryService;
        this.ambulanceRepository = ambulanceRepository;
    }

    @GetMapping("/ambulances")
    public ResponseEntity<List<Ambulance>> getAmbulanceTelemetry() {
        return ResponseEntity.ok(ambulanceRepository.findAll());
    }

    @PostMapping("/ping")
    public ResponseEntity<Ambulance> receivePing(@RequestBody TelemetryPingDto ping) {
        Ambulance updated = telemetryService.processTelemetryPing(ping);
        return ResponseEntity.ok(updated);
    }
}
