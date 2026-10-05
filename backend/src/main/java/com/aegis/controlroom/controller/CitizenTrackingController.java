package com.aegis.controlroom.controller;

import com.aegis.controlroom.service.CitizenTrackingService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/tracking")
public class CitizenTrackingController {

    private final CitizenTrackingService citizenTrackingService;

    public CitizenTrackingController(CitizenTrackingService citizenTrackingService) {
        this.citizenTrackingService = citizenTrackingService;
    }

    @GetMapping("/{token}")
    public ResponseEntity<Map<String, Object>> getTrackingSnapshot(@PathVariable String token) {
        Map<String, Object> snapshot = citizenTrackingService.getTrackingSnapshot(token);
        return ResponseEntity.ok(snapshot);
    }
}
