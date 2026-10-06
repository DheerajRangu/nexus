package com.aegis.controlroom.service;

import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.model.Hospital;
import com.aegis.controlroom.model.Roadblock;
import com.aegis.controlroom.repository.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Profile("demo")
public class DemoResetService {

    private final EmergencyCaseRepository emergencyCaseRepository;
    private final IncidentLocationRepository incidentLocationRepository;
    private final DispatchOfferRepository dispatchOfferRepository;
    private final MissionRepository missionRepository;
    private final HospitalRequestRepository hospitalRequestRepository;
    private final ReservationRepository reservationRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final HospitalRepository hospitalRepository;
    private final RoadblockRepository roadblockRepository;
    private final AuditEventRepository auditEventRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final TrackingSessionRepository trackingSessionRepository;
    private final SmsOutboxRepository smsOutboxRepository;
    private final RouteVersionRepository routeVersionRepository;
    private final WebhookIdempotencyRepository webhookIdempotencyRepository;
    private final WebSocketNotificationService webSocketNotificationService;
    private final JdbcTemplate jdbc;
    private final AIServiceClient aiServiceClient;

    public DemoResetService(EmergencyCaseRepository emergencyCaseRepository,
                            IncidentLocationRepository incidentLocationRepository,
                            DispatchOfferRepository dispatchOfferRepository,
                            MissionRepository missionRepository,
                            HospitalRequestRepository hospitalRequestRepository,
                            ReservationRepository reservationRepository,
                            AmbulanceRepository ambulanceRepository,
                            HospitalRepository hospitalRepository,
                            RoadblockRepository roadblockRepository,
                            AuditEventRepository auditEventRepository,
                            OutboxEventRepository outboxEventRepository,
                            TrackingSessionRepository trackingSessionRepository,
                            SmsOutboxRepository smsOutboxRepository,
                            RouteVersionRepository routeVersionRepository,
                            WebhookIdempotencyRepository webhookIdempotencyRepository,
                            WebSocketNotificationService webSocketNotificationService,
                            JdbcTemplate jdbc,
                            AIServiceClient aiServiceClient) {
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.dispatchOfferRepository = dispatchOfferRepository;
        this.missionRepository = missionRepository;
        this.hospitalRequestRepository = hospitalRequestRepository;
        this.reservationRepository = reservationRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.hospitalRepository = hospitalRepository;
        this.roadblockRepository = roadblockRepository;
        this.auditEventRepository = auditEventRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.trackingSessionRepository = trackingSessionRepository;
        this.smsOutboxRepository = smsOutboxRepository;
        this.routeVersionRepository = routeVersionRepository;
        this.webhookIdempotencyRepository = webhookIdempotencyRepository;
        this.webSocketNotificationService = webSocketNotificationService;
        this.jdbc = jdbc;
        this.aiServiceClient = aiServiceClient;
    }

    @Transactional
    public Map<String, Object> resetAllOperationalData() {
        aiServiceClient.setForceFallback(false);

        routeVersionRepository.deleteAll();
        outboxEventRepository.deleteAll();
        reservationRepository.deleteAll();
        hospitalRequestRepository.deleteAll();
        missionRepository.deleteAll();
        dispatchOfferRepository.deleteAll();
        smsOutboxRepository.deleteAll();
        trackingSessionRepository.deleteAll();
        incidentLocationRepository.deleteAll();
        emergencyCaseRepository.deleteAll();
        auditEventRepository.deleteAll();
        webhookIdempotencyRepository.deleteAll();
        jdbc.update("DELETE FROM roadblocks WHERE roadblock_id LIKE 'rb-demo-%' OR roadblock_id LIKE 'rb-c2-%'");

        // Restore seed ambulances to fixed baseline
        for (Ambulance amb : ambulanceRepository.findAll()) {
            if (amb.getAmbulanceId().startsWith("amb-")) {
                ambulanceRepository.delete(amb);
                continue;
            }
            amb.setIsAvailable(true);
            amb.setStatus("IDLE");
            amb.setTelemetryUpdatedAt(Instant.now());
            if ("AMB-108-NORTH-01".equals(amb.getAmbulanceId())) {
                amb.setLatitude(12.9790);
                amb.setLongitude(77.5910);
                amb.setAssignedDriverId("usr-drv-01");
            } else if ("AMB-108-CENTRAL-02".equals(amb.getAmbulanceId())) {
                amb.setLatitude(12.9680);
                amb.setLongitude(77.6010);
                amb.setAssignedDriverId("usr-drv-02");
            } else if ("AMB-108-SOUTH-03".equals(amb.getAmbulanceId())) {
                amb.setLatitude(12.9210);
                amb.setLongitude(77.5840);
                amb.setAssignedDriverId(null);
            }
            ambulanceRepository.save(amb);
        }
        jdbc.update("DELETE FROM driver_shifts WHERE shift_id LIKE 'sh-c1-%' OR shift_id LIKE 'sh-c3-%'");
        jdbc.update("UPDATE driver_shifts SET is_active = TRUE WHERE shift_id IN ('shf-01','shf-02')");

        for (Hospital h : hospitalRepository.findAll()) {
            if (h.getHospitalId().startsWith("hosp-")) {
                hospitalRepository.delete(h);
                continue;
            }
            h.setReservedBeds(0);
            h.setResourceUpdatedAt(Instant.now());
            if (h.getHospitalId().contains("GENERAL")) {
                h.setAvailableBeds(14);
                h.setAvailableIcu(3);
                h.setEmergencyWorkload("NORMAL");
            } else if (h.getHospitalId().contains("JUDE")) {
                h.setAvailableBeds(8);
                h.setAvailableIcu(1);
                h.setEmergencyWorkload("HIGH");
            } else {
                h.setAvailableBeds(2);
                h.setAvailableIcu(0);
                h.setEmergencyWorkload("CRITICAL");
            }
            hospitalRepository.save(h);
        }

        // Keep metro seed roadblock verified with fixed expiry window from now
        roadblockRepository.findById("rb-metro-01").ifPresent(rb -> {
            rb.setVerified(true);
            rb.setLatitude(12.9750);
            rb.setLongitude(77.5980);
            rb.setRadiusMeters(150.0);
            rb.setExpiresAt(Instant.now().plusSeconds(12 * 3600));
            roadblockRepository.save(rb);
        });

        Map<String, Object> state = fingerprint();
        webSocketNotificationService.broadcastEvent(
                "/topic/system", "DEMO_SYSTEM_RESET", "SYSTEM", state);
        return state;
    }

    public Map<String, Object> fingerprint() {
        Map<String, Object> fp = new LinkedHashMap<>();
        fp.put("cases", emergencyCaseRepository.count());
        fp.put("missions", missionRepository.count());
        fp.put("offers", dispatchOfferRepository.count());
        fp.put("reservations", reservationRepository.count());
        fp.put("locations", incidentLocationRepository.count());
        fp.put("ambAvailable", ambulanceRepository.findAll().stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsAvailable())).count());
        fp.put("hospitals", hospitalRepository.findAll().stream()
                .sorted(Comparator.comparing(Hospital::getHospitalId))
                .map(h -> h.getHospitalId() + ":" + h.getAvailableBeds() + ":" + h.getReservedBeds())
                .collect(Collectors.toList()));
        fp.put("demoRoadblocks", roadblockRepository.findAll().stream()
                .map(Roadblock::getRoadblockId)
                .filter(id -> id.startsWith("rb-demo-"))
                .sorted()
                .collect(Collectors.toList()));
        return fp;
    }
}
