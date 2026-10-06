package com.aegis.controlroom.service;

import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
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
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        String token = "tk_" + HexFormat.of().formatHex(raw);
        TrackingSession session = new TrackingSession();
        session.setSessionId("sess-" + UUID.randomUUID().toString().substring(0, 8));
        session.setEmergencyId(emergencyId);
        session.setTrackingToken(sha256(token));
        session.setPresentedToken(token);
        session.setExpiresAt(Instant.now().plus(4, ChronoUnit.HOURS));
        trackingSessionRepository.save(session);
        return session;
    }

    public Map<String, Object> getTrackingSnapshot(String token) {
        TrackingSession session = trackingSessionRepository.findByTrackingToken(sha256(token))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (session.getExpiresAt().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.GONE);
        }
        return buildSnapshot(session.getEmergencyId());
    }

    /** Operator/demo reconnect helper — same payload shape without presenting the raw token. */
    public Map<String, Object> snapshotForEmergency(String emergencyId) {
        return buildSnapshot(emergencyId);
    }

    private Map<String, Object> buildSnapshot(String emergencyId) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId).orElse(null);
        IncidentLocation loc = incidentLocationRepository.findByEmergencyId(emergencyId).orElse(null);
        Mission mission = missionRepository.findByEmergencyId(emergencyId).orElse(null);

        Map<String, Object> result = new HashMap<>();
        result.put("emergencyId", emergencyId);
        result.put("token", "********");
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

    public static String sha256(String token) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
