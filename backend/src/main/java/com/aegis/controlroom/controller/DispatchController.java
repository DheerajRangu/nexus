package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.dto.DispatchOfferRequestDto;
import com.aegis.controlroom.dto.OfferResponseDto;
import com.aegis.controlroom.model.DispatchOffer;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.security.ScopeGuard;
import com.aegis.controlroom.service.DispatchEngineService;
import com.aegis.controlroom.service.MissionStateMachineService;
import com.aegis.controlroom.service.MissionRoutingService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;

@RestController
@RequestMapping("/api/v1/dispatch")
public class DispatchController {

    private final DispatchEngineService dispatchEngineService;
    private final MissionStateMachineService missionStateMachineService;
    private final ScopeGuard scopeGuard;
    private final MissionRoutingService missionRoutingService;

    public DispatchController(DispatchEngineService dispatchEngineService,
                              MissionStateMachineService missionStateMachineService,
                              ScopeGuard scopeGuard,
                              MissionRoutingService missionRoutingService) {
        this.dispatchEngineService = dispatchEngineService;
        this.missionStateMachineService = missionStateMachineService;
        this.scopeGuard = scopeGuard;
        this.missionRoutingService = missionRoutingService;
    }

    @GetMapping("/missions/{missionId}")
    public ResponseEntity<Mission> readMission(@PathVariable String missionId) {
        return ResponseEntity.ok(scopeGuard.readMission(missionId));
    }

    @GetMapping("/missions")
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public ResponseEntity<?> activeMissions() {
        return ResponseEntity.ok(missionRoutingService.activeMissions());
    }

    @GetMapping("/missions/{missionId}/route")
    public ResponseEntity<?> currentRoute(@PathVariable String missionId) {
        scopeGuard.readMission(missionId);
        return ResponseEntity.ok(missionRoutingService.currentRoute(missionId));
    }

    @GetMapping("/shortlist/{emergencyId}")
    public ResponseEntity<List<AmbulanceRankDto>> shortlistAmbulances(@PathVariable String emergencyId) {
        List<AmbulanceRankDto> shortlist = dispatchEngineService.shortlistAndRankAmbulances(emergencyId);
        return ResponseEntity.ok(shortlist);
    }

    @GetMapping("/offers/{emergencyId}")
    @PreAuthorize("hasAnyRole('SUPERVISOR','OPERATOR')")
    public ResponseEntity<?> offersForEmergency(@PathVariable String emergencyId) {
        return ResponseEntity.ok(dispatchEngineService.getOffersForEmergency(emergencyId));
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
