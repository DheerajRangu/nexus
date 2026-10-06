package com.aegis.controlroom.service;

import com.aegis.controlroom.dto.InboundCallWebhookDto;
import com.aegis.controlroom.dto.LocationConfirmDto;
import com.aegis.controlroom.dto.ManualIntakeRequestDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final OutboxService outboxService;
    private final DispatchEngineService dispatchEngineService;
    private final boolean autoDispatchEnabled;

    public IntakeService(EmergencyCaseRepository emergencyCaseRepository,
                         IncidentLocationRepository incidentLocationRepository,
                         WebhookIdempotencyRepository webhookIdempotencyRepository,
                         CitizenTrackingService citizenTrackingService,
                         SmsOutboxService smsOutboxService,
                         AIServiceClient aiServiceClient,
                         WebSocketNotificationService webSocketNotificationService,
                         OutboxService outboxService,
                         DispatchEngineService dispatchEngineService,
                         @Value("${aegis.dispatch.auto-enabled:true}") boolean autoDispatchEnabled) {
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.webhookIdempotencyRepository = webhookIdempotencyRepository;
        this.citizenTrackingService = citizenTrackingService;
        this.smsOutboxService = smsOutboxService;
        this.aiServiceClient = aiServiceClient;
        this.webSocketNotificationService = webSocketNotificationService;
        this.outboxService = outboxService;
        this.dispatchEngineService = dispatchEngineService;
        this.autoDispatchEnabled = autoDispatchEnabled;
    }

    public boolean verifySignature(String timestamp, String rawBody, String signature) {
        return com.aegis.controlroom.security.WebhookSignature.matches(webhookSecret, timestamp, rawBody, signature);
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
        loc.setCallerLat(dto.getCallerLat());
        loc.setCallerLng(dto.getCallerLng());
        loc.setCallerAccuracyMeters(dto.getAccuracyMeters());
        loc.setLocationSource(dto.getCallerLat() != null && dto.getCallerLng() != null ? "CALLER_SHARED" : "NOT_PROVIDED");
        incidentLocationRepository.save(loc);

        // Save Idempotency
        if (idempotencyKey != null) {
            webhookIdempotencyRepository.save(new WebhookIdempotency(idempotencyKey, dto.getExternalCallRef()));
        }

        // Create tracking token
        TrackingSession session = citizenTrackingService.createSession(emergencyId);

        // Send SMS outbox link
        String trackingUrl = "http://localhost:5173/track/" + session.getPresentedToken();
        smsOutboxService.sendSms(dto.getCallbackNumber(), "AEGIS Emergency Link: Confirm your exact location & track response: " + trackingUrl);

        int version = savedCase.getEntityVersion() != null ? savedCase.getEntityVersion() : 1;
        outboxService.enqueue("case.created", emergencyId, version, Map.of(
                "emergencyId", emergencyId,
                "aiStatus", nlp.getOrDefault("aiStatus", "UNKNOWN"),
                "chiefComplaint", savedCase.getChiefComplaint()
        ));

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
        boolean coordinatesProvided = dto.getLatitude() != null && dto.getLongitude() != null;
        eCase.setLocationConfirmed(coordinatesProvided && !Boolean.TRUE.equals(dto.getProvisionalDispatch()));
        eCase.setCurrentState(eCase.getLocationConfirmed() ? "LOCATION_CONFIRMED" : "INTAKE_CREATED");

        EmergencyCase savedCase = emergencyCaseRepository.save(eCase);

        IncidentLocation loc = new IncidentLocation();
        loc.setLocationId("loc-" + UUID.randomUUID().toString().substring(0, 8));
        loc.setEmergencyId(emergencyId);
        loc.setCallerLat(dto.getLatitude());
        loc.setCallerLng(dto.getLongitude());
        loc.setCallerAccuracyMeters(dto.getAccuracyMeters());
        if (eCase.getLocationConfirmed()) {
            loc.setConfirmedLat(dto.getLatitude());
            loc.setConfirmedLng(dto.getLongitude());
            loc.setConfirmedAddress(dto.getAddressLandmark());
        }
        loc.setBuildingFloorNotes(dto.getBuildingDetails());
        loc.setLocationSource(coordinatesProvided ? "OPERATOR_PIN" : "NOT_PROVIDED");
        incidentLocationRepository.save(loc);

        TrackingSession session = citizenTrackingService.createSession(emergencyId);
        String trackingUrl = "http://localhost:5173/track/" + session.getPresentedToken();
        smsOutboxService.sendSms(dto.getCallbackNumber(), "AEGIS Emergency Link: Track assigned response unit: " + trackingUrl);

        webSocketNotificationService.broadcastEvent("/topic/cases", "CASE_CREATED", emergencyId, savedCase);
        offerAutomaticallyWhenLocationIsReady(savedCase);
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
        offerAutomaticallyWhenLocationIsReady(updated);
        return updated;
    }

    private void offerAutomaticallyWhenLocationIsReady(EmergencyCase emergencyCase) {
        if (autoDispatchEnabled && Boolean.TRUE.equals(emergencyCase.getLocationConfirmed())) {
            dispatchEngineService.autoDispatchTop(emergencyCase.getEmergencyId());
        }
    }
}
