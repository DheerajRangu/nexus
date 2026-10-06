package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.InboundCallWebhookDto;
import com.aegis.controlroom.dto.LocationConfirmDto;
import com.aegis.controlroom.dto.ManualIntakeRequestDto;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.service.IntakeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/intake")
public class CallIntakeController {

    private final IntakeService intakeService;
    private final ObjectMapper objectMapper;

    public CallIntakeController(IntakeService intakeService, ObjectMapper objectMapper) {
        this.intakeService = intakeService;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/webhook")
    public ResponseEntity<EmergencyCase> handleWebhookIntake(
            @RequestHeader(value = "X-Aegis-Signature", required = false) String signature,
            @RequestHeader(value = "X-Aegis-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody String rawBody) throws Exception {

        if (!intakeService.verifySignature(timestamp, rawBody, signature)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        InboundCallWebhookDto dto = objectMapper.readValue(rawBody, InboundCallWebhookDto.class);
        EmergencyCase createdCase = intakeService.processWebhookIntake(dto, idempotencyKey);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(createdCase);
    }

    @PostMapping("/manual")
    public ResponseEntity<EmergencyCase> handleManualIntake(@RequestBody ManualIntakeRequestDto dto) {
        EmergencyCase createdCase = intakeService.processManualIntake(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdCase);
    }
}
