package com.aegis.controlroom.service;

import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.repository.AmbulanceRepository;
import com.aegis.controlroom.repository.EmergencyCaseRepository;
import com.aegis.controlroom.repository.MissionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class MissionStateMachineService {

    private final MissionRepository missionRepository;
    private final EmergencyCaseRepository emergencyCaseRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    public MissionStateMachineService(MissionRepository missionRepository,
                                       EmergencyCaseRepository emergencyCaseRepository,
                                       AmbulanceRepository ambulanceRepository,
                                       WebSocketNotificationService webSocketNotificationService) {
        this.missionRepository = missionRepository;
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    @Transactional
    public Mission transitionMissionState(String missionId, String nextState) {
        Mission mission = missionRepository.findById(missionId)
                .orElseThrow(() -> new IllegalArgumentException("Mission not found: " + missionId));

        String currentState = mission.getCurrentState();
        validateTransition(currentState, nextState);

        mission.setCurrentState(nextState);
        if ("HANDOVER_COMPLETE".equals(nextState) || "CLOSED".equals(nextState)) {
            mission.setCompletedAt(Instant.now());

            // Release ambulance back to available pool
            Ambulance amb = ambulanceRepository.findById(mission.getAmbulanceId()).orElse(null);
            if (amb != null) {
                amb.setIsAvailable(true);
                amb.setStatus("IDLE");
                ambulanceRepository.save(amb);
            }
        }

        Mission savedMission = missionRepository.save(mission);

        EmergencyCase eCase = emergencyCaseRepository.findById(mission.getEmergencyId()).orElse(null);
        if (eCase != null) {
            eCase.setCurrentState(nextState);
            eCase.setUpdatedAt(Instant.now());
            emergencyCaseRepository.save(eCase);
        }

        webSocketNotificationService.broadcastEvent("/topic/missions", "MISSION_STATE_CHANGED", missionId, savedMission);
        webSocketNotificationService.broadcastEvent("/topic/cases", "CASE_STATE_CHANGED", mission.getEmergencyId(), eCase);

        return savedMission;
    }

    private void validateTransition(String current, String next) {
        // Enforce strict mission state machine rules
        if ("DISPATCHED".equals(current) && "EN_ROUTE_PATIENT".equals(next)) return;
        if ("EN_ROUTE_PATIENT".equals(current) && "PATIENT_PICKED_UP".equals(next)) return;
        if ("PATIENT_PICKED_UP".equals(current) && "EN_ROUTE_HOSPITAL".equals(next)) return;
        if ("EN_ROUTE_HOSPITAL".equals(current) && "ARRIVED_HOSPITAL".equals(next)) return;
        if ("ARRIVED_HOSPITAL".equals(current) && "HANDOVER_COMPLETE".equals(next)) return;
        if ("HANDOVER_COMPLETE".equals(current) && "CLOSED".equals(next)) return;

        // Allow direct closing by supervisor if required
        if ("CLOSED".equals(next)) return;

        throw new IllegalStateException(String.format("Invalid state transition from %s to %s", current, next));
    }
}
