package com.aegis.controlroom.service;

import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class CitizenTrackingService {
    private final TrackingSessionRepository trackingSessionRepository;
    private final EmergencyCaseRepository emergencyCaseRepository;
    private final IncidentLocationRepository incidentLocationRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final MissionRepository missionRepository;
    private final HospitalRepository hospitalRepository;

    public CitizenTrackingService(TrackingSessionRepository trackingSessionRepository,
                                  EmergencyCaseRepository emergencyCaseRepository,
                                  IncidentLocationRepository incidentLocationRepository,
                                  AmbulanceRepository ambulanceRepository,
                                  MissionRepository missionRepository,
                                  HospitalRepository hospitalRepository) {
        this.trackingSessionRepository = trackingSessionRepository;
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.missionRepository = missionRepository;
        this.hospitalRepository = hospitalRepository;
    }

    public TrackingSession createSession(String emergencyId) {
        String token = "tk_" + UUID.randomUUID().toString().replace("-", "");
        TrackingSession session = new TrackingSession();
        session.setSessionId("sess-" + UUID.randomUUID().toString().substring(0, 8));
        session.setEmergencyId(emergencyId);
        session.setTrackingToken(token);
        session.setExpiresAt(Instant.now().plus(4, ChronoUnit.HOURS));
        return trackingSessionRepository.save(session);
    }

    public Map<String, Object> getTrackingSnapshot(String token) {
        TrackingSession session = trackingSessionRepository.findByTrackingToken(token)
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired tracking token"));

        EmergencyCase eCase = emergencyCaseRepository.findById(session.getEmergencyId()).orElse(null);
        IncidentLocation loc = incidentLocationRepository.findByEmergencyId(session.getEmergencyId()).orElse(null);
        Mission mission = missionRepository.findByEmergencyId(session.getEmergencyId()).orElse(null);

        Map<String, Object> result = new HashMap<>();
        result.put("emergencyId", session.getEmergencyId());
        result.put("token", token);
        result.put("caseState", eCase != null ? eCase.getCurrentState() : "UNKNOWN");
        result.put("triagePriority", eCase != null ? eCase.getTriagePriority() : "P3_STANDARD");
        result.put("incidentLocation", loc);

        if (mission != null) {
            result.put("missionState", mission.getCurrentState());
            result.put("pickupEtaMins", mission.getPickupEtaMins());
            result.put("hospitalEtaMins", mission.getHospitalEtaMins());

            Ambulance amb = ambulanceRepository.findById(mission.getAmbulanceId()).orElse(null);
            if (amb != null) {
                Map<String, Object> ambData = new HashMap<>();
                ambData.put("ambulanceId", amb.getAmbulanceId());
                ambData.put("licensePlate", amb.getLicensePlate());
                ambData.put("capabilityTier", amb.getCapabilityTier());
                ambData.put("latitude", amb.getLatitude());
                ambData.put("longitude", amb.getLongitude());
                ambData.put("telemetryUpdatedAt", amb.getTelemetryUpdatedAt());
                result.put("assignedAmbulance", ambData);
            }

            if (mission.getAssignedHospitalId() != null) {
                Hospital hosp = hospitalRepository.findById(mission.getAssignedHospitalId()).orElse(null);
                if (hosp != null) {
                    Map<String, Object> hospData = new HashMap<>();
                    hospData.put("hospitalId", hosp.getHospitalId());
                    hospData.put("name", hosp.getName());
                    hospData.put("latitude", hosp.getLatitude());
                    hospData.put("longitude", hosp.getLongitude());
                    result.put("reservedHospital", hospData);
                }
            }
        }
        return result;
    }
}
