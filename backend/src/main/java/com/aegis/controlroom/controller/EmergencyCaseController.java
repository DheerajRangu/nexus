package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.LocationConfirmDto;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.repository.EmergencyCaseRepository;
import com.aegis.controlroom.service.IntakeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/cases")
public class EmergencyCaseController {

    private final EmergencyCaseRepository emergencyCaseRepository;
    private final IntakeService intakeService;

    public EmergencyCaseController(EmergencyCaseRepository emergencyCaseRepository, IntakeService intakeService) {
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.intakeService = intakeService;
    }

    @GetMapping
    public ResponseEntity<List<EmergencyCase>> getAllCases() {
        return ResponseEntity.ok(emergencyCaseRepository.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<EmergencyCase> getCaseById(@PathVariable String id) {
        return emergencyCaseRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{emergencyId}/confirm-location")
    public ResponseEntity<EmergencyCase> confirmLocation(
            @PathVariable String emergencyId,
            @RequestBody LocationConfirmDto dto) {
        EmergencyCase updated = intakeService.confirmLocation(emergencyId, dto);
        return ResponseEntity.ok(updated);
    }
}
