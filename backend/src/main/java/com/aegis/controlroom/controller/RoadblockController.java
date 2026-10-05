package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.RoadblockRequestDto;
import com.aegis.controlroom.model.Roadblock;
import com.aegis.controlroom.repository.RoadblockRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/roadblocks")
public class RoadblockController {

    private final RoadblockRepository roadblockRepository;

    public RoadblockController(RoadblockRepository roadblockRepository) {
        this.roadblockRepository = roadblockRepository;
    }

    @GetMapping
    public ResponseEntity<List<Roadblock>> getActiveRoadblocks() {
        return ResponseEntity.ok(roadblockRepository.findAll());
    }

    @PostMapping
    public ResponseEntity<Roadblock> createRoadblock(@RequestBody RoadblockRequestDto dto) {
        Roadblock rb = new Roadblock();
        rb.setRoadblockId("rb-" + UUID.randomUUID().toString().substring(0, 8));
        rb.setSource(dto.getSource());
        rb.setLatitude(dto.getLatitude());
        rb.setLongitude(dto.getLongitude());
        rb.setRadiusMeters(dto.getRadiusMeters() != null ? dto.getRadiusMeters() : 100.0);
        rb.setScope(dto.getScope() != null ? dto.getScope() : "FULL_BLOCK");
        rb.setVerified(true);
        rb.setExpiresAt(Instant.now().plus(dto.getDurationMinutes() != null ? dto.getDurationMinutes() : 60, ChronoUnit.MINUTES));

        Roadblock saved = roadblockRepository.save(rb);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }
}
