package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.InboundCallWebhookDto;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.service.IntakeService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/demo/intake")
@Profile("demo")
public class DemoIntakeController {
    private final IntakeService intakeService;

    public DemoIntakeController(IntakeService intakeService) {
        this.intakeService = intakeService;
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public ResponseEntity<EmergencyCase> simulateInboundCall(@RequestBody InboundCallWebhookDto request) {
        EmergencyCase created = intakeService.processWebhookIntake(request, "demo-" + request.getExternalCallRef());
        return ResponseEntity.accepted().body(created);
    }
}
