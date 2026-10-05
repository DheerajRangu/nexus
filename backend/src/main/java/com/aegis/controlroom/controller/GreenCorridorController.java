package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.GreenCorridorUpdateDto;
import com.aegis.controlroom.model.GreenCorridorSignal;
import com.aegis.controlroom.service.GreenCorridorService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/green-corridors")
public class GreenCorridorController {

    private final GreenCorridorService greenCorridorService;

    public GreenCorridorController(GreenCorridorService greenCorridorService) {
        this.greenCorridorService = greenCorridorService;
    }

    @GetMapping("/simulators")
    public ResponseEntity<List<GreenCorridorSignal>> getCorridorSignals() {
        return ResponseEntity.ok(greenCorridorService.getAllSignals());
    }

    @PostMapping("/simulators/{junctionId}/set-state")
    public ResponseEntity<GreenCorridorSignal> updateSignalState(
            @PathVariable String junctionId,
            @RequestBody GreenCorridorUpdateDto dto) {
        GreenCorridorSignal updated = greenCorridorService.updateSignalState(junctionId, dto.getState(), dto.getMissionId());
        return ResponseEntity.ok(updated);
    }
}
