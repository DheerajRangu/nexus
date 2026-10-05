package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.dto.DispatchOfferRequestDto;
import com.aegis.controlroom.dto.OfferResponseDto;
import com.aegis.controlroom.model.DispatchOffer;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.service.DispatchEngineService;
import com.aegis.controlroom.service.MissionStateMachineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/dispatch")
public class DispatchController {

    private final DispatchEngineService dispatchEngineService;
    private final MissionStateMachineService missionStateMachineService;

    public DispatchController(DispatchEngineService dispatchEngineService, MissionStateMachineService missionStateMachineService) {
        this.dispatchEngineService = dispatchEngineService;
        this.missionStateMachineService = missionStateMachineService;
    }

    @GetMapping("/shortlist/{emergencyId}")
    public ResponseEntity<List<AmbulanceRankDto>> shortlistAmbulances(@PathVariable String emergencyId) {
        List<AmbulanceRankDto> shortlist = dispatchEngineService.shortlistAndRankAmbulances(emergencyId);
        return ResponseEntity.ok(shortlist);
    }

    @PostMapping("/offer")
    public ResponseEntity<DispatchOffer> createOffer(@RequestBody DispatchOfferRequestDto dto) {
        DispatchOffer offer = dispatchEngineService.createDispatchOffer(dto.getEmergencyId(), dto.getAmbulanceId());
        return ResponseEntity.ok(offer);
    }

    @PostMapping("/offer/{offerId}/respond")
    public ResponseEntity<Mission> respondToOffer(
            @PathVariable String offerId,
            @RequestBody OfferResponseDto dto) {
        Mission mission = dispatchEngineService.respondToOffer(offerId, dto.getAction());
        return ResponseEntity.ok(mission);
    }

    @PostMapping("/missions/{missionId}/transition")
    public ResponseEntity<Mission> transitionMissionState(
            @PathVariable String missionId,
            @RequestParam String nextState) {
        Mission updated = missionStateMachineService.transitionMissionState(missionId, nextState);
        return ResponseEntity.ok(updated);
    }
}
