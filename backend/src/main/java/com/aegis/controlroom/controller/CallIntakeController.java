package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.InboundCallWebhookDto;
import com.aegis.controlroom.dto.LocationConfirmDto;
import com.aegis.controlroom.dto.ManualIntakeRequestDto;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.service.IntakeService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/intake")
public class CallIntakeController {

    private final IntakeService intakeService;

    public CallIntakeController(IntakeService intakeService) {
        this.intakeService = intakeService;
    }

    @PostMapping("/webhook")
    public ResponseEntity<EmergencyCase> handleWebhookIntake(
            @RequestHeader(value = "X-Aegis-Signature", required = false) String signature,
            @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody InboundCallWebhookDto dto) {

        EmergencyCase createdCase = intakeService.processWebhookIntake(dto, idempotencyKey);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(createdCase);
    }

    @PostMapping("/manual")
    public ResponseEntity<EmergencyCase> handleManualIntake(@RequestBody ManualIntakeRequestDto dto) {
        EmergencyCase createdCase = intakeService.processManualIntake(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdCase);
    }
}
