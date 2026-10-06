package com.aegis.controlroom.service;

import com.aegis.controlroom.api.DomainConflictException;
import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.repository.AmbulanceRepository;
import com.aegis.controlroom.repository.EmergencyCaseRepository;
import com.aegis.controlroom.repository.MissionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.Set;

@Service
public class MissionStateMachineService {

    private static final Map<String, Set<String>> ALLOWED = Map.ofEntries(
            Map.entry("CREATED", Set.of("DISPATCHING", "CANCELLED", "ESCALATED")),
            Map.entry("DISPATCHING", Set.of("ASSIGNED", "CANCELLED", "ESCALATED")),
            Map.entry("ASSIGNED", Set.of("EN_ROUTE_TO_PATIENT")),
            Map.entry("EN_ROUTE_TO_PATIENT", Set.of("ON_SCENE")),
            Map.entry("ON_SCENE", Set.of("TRANSPORTING")),
            Map.entry("TRANSPORTING", Set.of("AT_HOSPITAL")),
            Map.entry("AT_HOSPITAL", Set.of("HANDED_OVER")),
            Map.entry("HANDED_OVER", Set.of("COMPLETED"))
    );

    private final MissionRepository missionRepository;
    private final EmergencyCaseRepository emergencyCaseRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final WebSocketNotificationService webSocketNotificationService;
    private final OutboxService outboxService;
    private final HospitalDecisionEngineService hospitalDecisionEngineService;

    public MissionStateMachineService(MissionRepository missionRepository,
                                       EmergencyCaseRepository emergencyCaseRepository,
                                       AmbulanceRepository ambulanceRepository,
                                       WebSocketNotificationService webSocketNotificationService,
                                       OutboxService outboxService,
                                       HospitalDecisionEngineService hospitalDecisionEngineService) {
        this.missionRepository = missionRepository;
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.webSocketNotificationService = webSocketNotificationService;
        this.outboxService = outboxService;
        this.hospitalDecisionEngineService = hospitalDecisionEngineService;
    }

    @Transactional
    public Mission transitionMissionState(String missionId, String nextState) {
        Mission mission = missionRepository.findById(missionId)
                .orElseThrow(() -> new IllegalArgumentException("Mission not found: " + missionId));

        String currentState = mission.getCurrentState();
        validateTransition(currentState, nextState, mission);

        mission.setCurrentState(nextState);
        if ("HANDED_OVER".equals(nextState) || "COMPLETED".equals(nextState)) {
            if ("HANDED_OVER".equals(nextState)) {
                hospitalDecisionEngineService.consumeReservationForEmergency(mission.getEmergencyId());
            }
            if ("COMPLETED".equals(nextState)) {
                mission.setCompletedAt(Instant.now());
                Ambulance amb = ambulanceRepository.findById(mission.getAmbulanceId()).orElse(null);
                if (amb != null) {
                    amb.setIsAvailable(true);
                    amb.setStatus("IDLE");
                    ambulanceRepository.save(amb);
                }
            }
        }

        Mission savedMission = missionRepository.save(mission);

        EmergencyCase eCase = emergencyCaseRepository.findById(mission.getEmergencyId()).orElse(null);
        if (eCase != null) {
            eCase.setCurrentState(nextState);
            eCase.setUpdatedAt(Instant.now());
            emergencyCaseRepository.save(eCase);
        }

        int version = savedMission.getEntityVersion() != null ? savedMission.getEntityVersion() : 1;
        String eventType = switch (nextState) {
            case "EN_ROUTE_TO_PATIENT" -> "mission.en_route";
            case "ON_SCENE" -> "mission.on_scene";
            case "TRANSPORTING" -> "mission.transporting";
            case "AT_HOSPITAL" -> "mission.at_hospital";
            case "HANDED_OVER" -> "mission.handed_over";
            case "COMPLETED" -> "mission.completed";
            case "CANCELLED" -> "mission.cancelled";
            case "ESCALATED" -> "mission.escalated";
            case "ASSIGNED" -> "mission.assigned";
            case "DISPATCHING" -> "mission.dispatching";
            default -> "mission." + nextState.toLowerCase();
        };
        outboxService.enqueue(eventType, missionId, version, savedMission);

        webSocketNotificationService.broadcastEvent("/topic/missions", eventType, missionId, savedMission);
        webSocketNotificationService.broadcastEvent("/topic/cases", "CASE_STATE_CHANGED", mission.getEmergencyId(), eCase);

        return savedMission;
    }

    private void validateTransition(String current, String next, Mission mission) {
        Set<String> allowed = ALLOWED.get(current);
        if (allowed == null || !allowed.contains(next)) {
            throw new DomainConflictException(String.format("Invalid state transition from %s to %s", current, next));
        }
        if ("TRANSPORTING".equals(next)) {
            EmergencyCase eCase = emergencyCaseRepository.findById(mission.getEmergencyId()).orElse(null);
            boolean reserved = eCase != null && eCase.getReservedHospitalId() != null
                    && !eCase.getReservedHospitalId().isBlank();
            boolean hospitalSet = mission.getAssignedHospitalId() != null
                    && !mission.getAssignedHospitalId().isBlank();
            if (!reserved && !hospitalSet) {
                throw new DomainConflictException("Destination must be reserved or operator-confirmed before TRANSPORTING");
            }
        }
    }
}
