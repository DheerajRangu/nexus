package com.aegis.controlroom.controller;

import com.aegis.controlroom.service.SnapshotService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class SnapshotController {

    private final SnapshotService snapshotService;

    public SnapshotController(SnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    @GetMapping("/snapshot")
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR','DRIVER','HOSPITAL_STAFF')")
    public ResponseEntity<Map<String, Object>> snapshot() {
        return ResponseEntity.ok(snapshotService.fullSnapshot());
    }
}
