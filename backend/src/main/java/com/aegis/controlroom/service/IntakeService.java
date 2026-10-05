package com.aegis.controlroom.service;

import com.aegis.controlroom.dto.InboundCallWebhookDto;
import com.aegis.controlroom.dto.LocationConfirmDto;
import com.aegis.controlroom.dto.ManualIntakeRequestDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

@Service
public class IntakeService {

    @Value("${aegis.webhook.secret:}")
    private String webhookSecret;

    private final EmergencyCaseRepository emergencyCaseRepository;
    private final IncidentLocationRepository incidentLocationRepository;
    private final WebhookIdempotencyRepository webhookIdempotencyRepository;
    private final CitizenTrackingService citizenTrackingService;
    private final SmsOutboxService smsOutboxService;
    private final AIServiceClient aiServiceClient;
    private final WebSocketNotificationService webSocketNotificationService;

    public IntakeService(EmergencyCaseRepository emergencyCaseRepository,
                         IncidentLocationRepository incidentLocationRepository,
                         WebhookIdempotencyRepository webhookIdempotencyRepository,
                         CitizenTrackingService citizenTrackingService,
                         SmsOutboxService smsOutboxService,
                         AIServiceClient aiServiceClient,
                         WebSocketNotificationService webSocketNotificationService) {
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.webhookIdempotencyRepository = webhookIdempotencyRepository;
        this.citizenTrackingService = citizenTrackingService;
        this.smsOutboxService = smsOutboxService;
        this.aiServiceClient = aiServiceClient;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    public boolean verifySignature(String rawBody, String signature) {
        if (signature == null || signature.isEmpty()) return true; // Permissive for demo
        try {
            Mac hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            hmac.init(secretKey);
            byte[] hash = hmac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString().equalsIgnoreCase(signature.replace("sha256=", ""));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            return false;
        }
    }

    @Transactional
    public EmergencyCase processWebhookIntake(InboundCallWebhookDto dto, String idempotencyKey) {
        if (idempotencyKey != null && webhookIdempotencyRepository.existsById(idempotencyKey)) {
            return emergencyCaseRepository.findByExternalCallRef(dto.getExternalCallRef()).orElse(null);
        }

        String emergencyId = "emg-" + UUID.randomUUID().toString().substring(0, 8);
        
        // NLP analysis
        Map<String, Object> nlp = aiServiceClient.parseNotesNLP(dto.getRawNotes() != null ? dto.getRawNotes() : "108 Inbound Call");

        EmergencyCase eCase = new EmergencyCase();
        eCase.setEmergencyId(emergencyId);
        eCase.setExternalCallRef(dto.getExternalCallRef());
        eCase.setCallbackNumber(dto.getCallbackNumber());
        eCase.setOperatorId(dto.getOperatorId());
        eCase.setChiefComplaint((String) nlp.get("chiefComplaint"));
        eCase.setTriagePriority((String) nlp.get("triagePriority"));
        eCase.setRawOperatorNotes(dto.getRawNotes());
        eCase.setLocationConfirmed(false);
        eCase.setCurrentState("INTAKE_CREATED");

        EmergencyCase savedCase = emergencyCaseRepository.save(eCase);

        // Save initial unconfirmed location
        IncidentLocation loc = new IncidentLocation();
        loc.setLocationId("loc-" + UUID.randomUUID().toString().substring(0, 8));
        loc.setEmergencyId(emergencyId);
        loc.setCallerLat(dto.getCallerLat() != null ? dto.getCallerLat() : 12.9716);
        loc.setCallerLng(dto.getCallerLng() != null ? dto.getCallerLng() : 77.5946);
        loc.setCallerAccuracyMeters(dto.getAccuracyMeters() != null ? dto.getAccuracyMeters() : 150.0);
        loc.setLocationSource("CALLER_CELL_TRIANGULATION");
        incidentLocationRepository.save(loc);

        // Save Idempotency
        if (idempotencyKey != null) {
            webhookIdempotencyRepository.save(new WebhookIdempotency(idempotencyKey, dto.getExternalCallRef()));
        }

        // Create tracking token
        TrackingSession session = citizenTrackingService.createSession(emergencyId);

        // Send SMS outbox link
        String trackingUrl = "http://localhost:5173/track/" + session.getTrackingToken();
        smsOutboxService.sendSms(dto.getCallbackNumber(), "AEGIS Emergency Link: Confirm your exact location & track response: " + trackingUrl);

        webSocketNotificationService.broadcastEvent("/topic/cases", "CASE_CREATED", emergencyId, savedCase);

        return savedCase;
    }

    @Transactional
    public EmergencyCase processManualIntake(ManualIntakeRequestDto dto) {
        String emergencyId = "emg-" + UUID.randomUUID().toString().substring(0, 8);

        EmergencyCase eCase = new EmergencyCase();
        eCase.setEmergencyId(emergencyId);
        eCase.setCallbackNumber(dto.getCallbackNumber());
        eCase.setChiefComplaint(dto.getChiefComplaint() != null ? dto.getChiefComplaint() : "GENERAL_EMERGENCY");
        eCase.setTriagePriority(dto.getPriority() != null ? dto.getPriority() : "P3_STANDARD");
        eCase.setRawOperatorNotes(dto.getNotes());
        eCase.setProvisionalDispatch(Boolean.TRUE.equals(dto.getProvisionalDispatch()));
        eCase.setLocationConfirmed(!Boolean.TRUE.equals(dto.getProvisionalDispatch()));
        eCase.setCurrentState(dto.getProvisionalDispatch() ? "LOCATION_CONFIRMED" : "INTAKE_CREATED");

        EmergencyCase savedCase = emergencyCaseRepository.save(eCase);

        IncidentLocation loc = new IncidentLocation();
        loc.setLocationId("loc-" + UUID.randomUUID().toString().substring(0, 8));
        loc.setEmergencyId(emergencyId);
        loc.setConfirmedLat(12.9716); // Default downtown MG Road
        loc.setConfirmedLng(77.5946);
        loc.setConfirmedAddress(dto.getAddressLandmark() != null ? dto.getAddressLandmark() : "City Center Plaza");
        loc.setBuildingFloorNotes(dto.getBuildingDetails());
        loc.setLocationSource("OPERATOR_MANUAL_ENTRY");
        incidentLocationRepository.save(loc);

        TrackingSession session = citizenTrackingService.createSession(emergencyId);
        String trackingUrl = "http://localhost:5173/track/" + session.getTrackingToken();
        smsOutboxService.sendSms(dto.getCallbackNumber(), "AEGIS Emergency Link: Track assigned response unit: " + trackingUrl);

        webSocketNotificationService.broadcastEvent("/topic/cases", "CASE_CREATED", emergencyId, savedCase);
        return savedCase;
    }

    @Transactional
    public EmergencyCase confirmLocation(String emergencyId, LocationConfirmDto dto) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Emergency case not found: " + emergencyId));

        IncidentLocation loc = incidentLocationRepository.findByEmergencyId(emergencyId)
                .orElse(new IncidentLocation());

        if (loc.getLocationId() == null) {
            loc.setLocationId("loc-" + UUID.randomUUID().toString().substring(0, 8));
            loc.setEmergencyId(emergencyId);
        }

        loc.setConfirmedLat(dto.getLatitude());
        loc.setConfirmedLng(dto.getLongitude());
        loc.setCallerAccuracyMeters(dto.getAccuracyMeters());
        loc.setConfirmedAddress(dto.getAddress());
        loc.setBuildingFloorNotes(dto.getBuildingFloorNotes());
        loc.setLocationSource(dto.getConfirmedBy() != null ? dto.getConfirmedBy() : "CITIZEN_PINPOINT");
        loc.setUpdatedAt(Instant.now());
        incidentLocationRepository.save(loc);

        eCase.setLocationConfirmed(true);
        if ("INTAKE_CREATED".equals(eCase.getCurrentState())) {
            eCase.setCurrentState("LOCATION_CONFIRMED");
        }
        eCase.setUpdatedAt(Instant.now());
        EmergencyCase updated = emergencyCaseRepository.save(eCase);

        webSocketNotificationService.broadcastEvent("/topic/cases", "LOCATION_CONFIRMED", emergencyId, updated);
        return updated;
    }
}
