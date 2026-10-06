package com.aegis.controlroom.service;

import com.aegis.controlroom.api.DomainConflictException;
import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import com.aegis.controlroom.routing.RouteEstimate;
import com.aegis.controlroom.routing.RoadGraphProvider;
import com.aegis.controlroom.routing.GraphRoute;
import com.aegis.controlroom.routing.RoutingProviderUnavailableException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class DispatchEngineService {

    private final AmbulanceRepository ambulanceRepository;
    private final EmergencyCaseRepository emergencyCaseRepository;
    private final IncidentLocationRepository incidentLocationRepository;
    private final DispatchOfferRepository dispatchOfferRepository;
    private final MissionRepository missionRepository;
    private final DriverShiftRepository driverShiftRepository;
    private final AuditEventRepository auditEventRepository;
    private final RoadGraphProvider roadGraphProvider;
    private final WebSocketNotificationService webSocketNotificationService;
    private final OutboxService outboxService;

    @Value("${aegis.dispatch.offer-ttl-seconds:30}")
    private long offerTtlSeconds;
    @Value("${aegis.dispatch.ping-freshness-seconds:120}")
    private long pingFreshnessSeconds;
    @Value("${aegis.dispatch.shortlist-size:5}")
    private int shortlistSize;
    @Value("${aegis.dispatch.auto-enabled:true}")
    private boolean autoEnabled;

    public DispatchEngineService(AmbulanceRepository ambulanceRepository,
                                 EmergencyCaseRepository emergencyCaseRepository,
                                 IncidentLocationRepository incidentLocationRepository,
                                 DispatchOfferRepository dispatchOfferRepository,
                                 MissionRepository missionRepository,
                                 DriverShiftRepository driverShiftRepository,
                                 AuditEventRepository auditEventRepository,
                                 RoadGraphProvider roadGraphProvider,
                                 WebSocketNotificationService webSocketNotificationService,
                                 OutboxService outboxService) {
        this.ambulanceRepository = ambulanceRepository;
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.dispatchOfferRepository = dispatchOfferRepository;
        this.missionRepository = missionRepository;
        this.driverShiftRepository = driverShiftRepository;
        this.auditEventRepository = auditEventRepository;
        this.roadGraphProvider = roadGraphProvider;
        this.webSocketNotificationService = webSocketNotificationService;
        this.outboxService = outboxService;
    }

    public List<AmbulanceRankDto> shortlistAndRankAmbulances(String emergencyId) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Emergency case not found: " + emergencyId));
        IncidentLocation loc = incidentLocationRepository.findByEmergencyId(emergencyId)
                .orElseThrow(() -> new IllegalStateException("Incident location not recorded"));

        Double targetLatValue = loc.getConfirmedLat() != null ? loc.getConfirmedLat() : loc.getCallerLat();
        Double targetLngValue = loc.getConfirmedLng() != null ? loc.getConfirmedLng() : loc.getCallerLng();
        if (targetLatValue == null || targetLngValue == null) {
            return List.of();
        }
        double targetLat = targetLatValue;
        double targetLng = targetLngValue;
        Instant freshest = Instant.now().minus(pingFreshnessSeconds, ChronoUnit.SECONDS);

        List<AmbulanceRankDto> ranked = new ArrayList<>();
        for (Ambulance amb : ambulanceRepository.findByIsAvailableTrue()) {
            if (!passesFilters(eCase, amb, freshest)) {
                continue;
            }
            Optional<DriverShift> shift = driverShiftRepository.findFirstByAmbulanceIdAndIsActiveTrue(amb.getAmbulanceId());
            if (shift.isEmpty()) {
                continue;
            }
            Optional<GraphRoute> availableRoute = roadGraphProvider.routeAvoidingBlocks(
                    amb.getLatitude(), amb.getLongitude(), targetLat, targetLng);
            if (availableRoute.isEmpty()) continue;
            GraphRoute graphRoute = availableRoute.get();
            RouteEstimate route = new RouteEstimate(graphRoute.distanceKm(), graphRoute.etaMins(),
                    graphRoute.provider(), graphRoute.simulated());
            List<String> reasons = new ArrayList<>();
            reasons.add(String.format("Distance to incident: %.2f km", route.distanceKm()));
            reasons.add(String.format("SIMULATED road ETA: %.1f mins via %s", route.etaMins(), route.provider()));
            reasons.add("Capability match: " + amb.getCapabilityTier());
            reasons.add("Active shift and fresh telemetry");
            if (route.simulated()) {
                reasons.add("Routing labelled SIMULATED");
            }

            double score = 100.0 - (route.distanceKm() * 2.0) - (route.etaMins() * 1.5);
            if ("ALS".equalsIgnoreCase(amb.getCapabilityTier())) {
                score += 15.0;
            }

            AmbulanceRankDto rank = new AmbulanceRankDto();
            rank.setAmbulanceId(amb.getAmbulanceId());
            rank.setLicensePlate(amb.getLicensePlate());
            rank.setCapabilityTier(amb.getCapabilityTier());
            rank.setDistanceKm(route.distanceKm());
            rank.setRawEtaMins(route.etaMins());
            rank.setCorrectedEtaMins(route.etaMins());
            rank.setScore(Math.round(score * 10.0) / 10.0);
            rank.setReasons(reasons);
            rank.setDriverId(shift.get().getDriverId());
            rank.setRoutingProvider(route.provider());
            rank.setSimulated(route.simulated());
            ranked.add(rank);
        }

        ranked.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        if (ranked.size() > shortlistSize) {
            return ranked.subList(0, shortlistSize);
        }
        return ranked;
    }

    public List<DispatchOffer> getOffersForEmergency(String emergencyId) {
        return dispatchOfferRepository.findByEmergencyIdOrderByOfferedAtDesc(emergencyId);
    }

    private boolean passesFilters(EmergencyCase eCase, Ambulance amb, Instant freshest) {
        if (amb.getTelemetryUpdatedAt() == null || amb.getTelemetryUpdatedAt().isBefore(freshest)) {
            return false;
        }
        if ("P1_CRITICAL".equals(eCase.getTriagePriority()) && !"ALS".equalsIgnoreCase(amb.getCapabilityTier())) {
            return false;
        }
        return Boolean.TRUE.equals(amb.getIsAvailable());
    }

    @Transactional
    public DispatchOffer createDispatchOffer(String emergencyId, String ambulanceId) {
        return createDispatchOffer(emergencyId, ambulanceId, false, null);
    }

    @Transactional
    public DispatchOffer createDispatchOffer(String emergencyId, String ambulanceId, boolean manualOverride, String justification) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Case not found"));
        Ambulance amb = ambulanceRepository.findById(ambulanceId)
                .orElseThrow(() -> new IllegalArgumentException("Ambulance not found"));
        if (!Boolean.TRUE.equals(amb.getIsAvailable())) {
            throw new IllegalStateException("Ambulance is currently unavailable");
        }
        DriverShift shift = driverShiftRepository.findFirstByAmbulanceIdAndIsActiveTrue(ambulanceId)
                .orElseThrow(() -> new IllegalStateException("No active shift for ambulance"));

        DispatchOffer offer = new DispatchOffer();
        offer.setOfferId("off-" + UUID.randomUUID().toString().substring(0, 8));
        offer.setEmergencyId(emergencyId);
        offer.setAmbulanceId(ambulanceId);
        offer.setDriverId(shift.getDriverId());
        offer.setStatus("OFFERED");
        offer.setOfferedAt(Instant.now());
        offer.setExpiresAt(Instant.now().plus(offerTtlSeconds, ChronoUnit.SECONDS));
        DispatchOffer saved = dispatchOfferRepository.save(offer);

        eCase.setCurrentState("DISPATCHING");
        eCase.setUpdatedAt(Instant.now());
        emergencyCaseRepository.save(eCase);

        if (manualOverride) {
            writeAudit("MANUAL_DISPATCH_OVERRIDE", "OPERATOR", emergencyId, "EMERGENCY",
                    "Manual override ambulance=" + ambulanceId + " justification=" + justification);
        }

        webSocketNotificationService.broadcastEvent("/topic/offers", "offer.created", saved.getOfferId(), saved);
        return saved;
    }

    @Transactional
    public Mission respondToOffer(String offerId, String action) {
        DispatchOffer offer = dispatchOfferRepository.findById(offerId)
                .orElseThrow(() -> new IllegalArgumentException("Dispatch offer not found"));

        if ("DECLINE".equalsIgnoreCase(action)) {
            if (!"OFFERED".equals(offer.getStatus())) {
                throw new DomainConflictException("Offer is no longer active");
            }
            offer.setStatus("DECLINED");
            offer.setRespondedAt(Instant.now());
            dispatchOfferRepository.save(offer);
            offerNextOrEscalate(offer.getEmergencyId(), offer.getAmbulanceId());
            return null;
        }

        Instant now = Instant.now();
        int accepted = dispatchOfferRepository.acceptIfStillOpen(offerId, now);
        if (accepted != 1) {
            throw new DomainConflictException("Offer already accepted, declined, or expired");
        }

        Ambulance ambulance = ambulanceRepository.findByIdForUpdate(offer.getAmbulanceId())
                .orElseThrow(() -> new DomainConflictException("Ambulance unavailable"));
        if (!Boolean.TRUE.equals(ambulance.getIsAvailable())) {
            throw new DomainConflictException("Ambulance already assigned");
        }
        ambulance.setIsAvailable(false);
        ambulance.setStatus("ASSIGNED");
        ambulanceRepository.save(ambulance);

        for (DispatchOffer sibling : dispatchOfferRepository.findByEmergencyIdAndStatus(offer.getEmergencyId(), "OFFERED")) {
            sibling.setStatus("WITHDRAWN");
            sibling.setRespondedAt(now);
            dispatchOfferRepository.save(sibling);
        }

        EmergencyCase eCase = emergencyCaseRepository.findById(offer.getEmergencyId()).orElseThrow();
        eCase.setCurrentState("ASSIGNED");
        eCase.setAssignedAmbulanceId(ambulance.getAmbulanceId());
        eCase.setUpdatedAt(now);
        emergencyCaseRepository.save(eCase);

        Mission mission = new Mission();
        mission.setMissionId("msn-" + UUID.randomUUID().toString().substring(0, 8));
        mission.setEmergencyId(eCase.getEmergencyId());
        mission.setAmbulanceId(ambulance.getAmbulanceId());
        mission.setDriverId(offer.getDriverId());
        mission.setCurrentState("ASSIGNED");
        Mission savedMission = missionRepository.save(mission);
        int version = savedMission.getEntityVersion() != null ? savedMission.getEntityVersion() : 1;
        outboxService.enqueue("mission.assigned", savedMission.getMissionId(), version, savedMission);

        webSocketNotificationService.broadcastEvent("/topic/missions", "mission.assigned", savedMission.getMissionId(), savedMission);
        return savedMission;
    }

    @Scheduled(fixedDelayString = "${aegis.dispatch.expiry-job-ms:5000}")
    @Transactional
    public void checkExpiredOffers() {
        Instant now = Instant.now();
        for (DispatchOffer offer : dispatchOfferRepository.findExpiredOpenOffers(now)) {
            int changed = dispatchOfferRepository.expireIfStillOpen(offer.getOfferId(), now);
            if (changed == 1) {
                offerNextOrEscalate(offer.getEmergencyId(), offer.getAmbulanceId());
                webSocketNotificationService.broadcastEvent("/topic/offers", "offer.expired", offer.getOfferId(), offer);
            }
        }
    }

    @Transactional
    public void offerNextOrEscalate(String emergencyId, String excludeAmbulanceId) {
        Set<String> alreadyTried = new HashSet<>();
        dispatchOfferRepository.findByEmergencyIdAndStatus(emergencyId, "OFFERED").forEach(o -> alreadyTried.add(o.getAmbulanceId()));
        dispatchOfferRepository.findByEmergencyIdAndStatus(emergencyId, "DECLINED").forEach(o -> alreadyTried.add(o.getAmbulanceId()));
        dispatchOfferRepository.findByEmergencyIdAndStatus(emergencyId, "EXPIRED").forEach(o -> alreadyTried.add(o.getAmbulanceId()));
        dispatchOfferRepository.findByEmergencyIdAndStatus(emergencyId, "WITHDRAWN").forEach(o -> alreadyTried.add(o.getAmbulanceId()));
        if (excludeAmbulanceId != null) {
            alreadyTried.add(excludeAmbulanceId);
        }

        List<AmbulanceRankDto> ranked;
        try {
            ranked = shortlistAndRankAmbulances(emergencyId);
        } catch (RoutingProviderUnavailableException exception) {
            escalateForRoutingProviderUnavailable(emergencyId, exception);
            return;
        }
        Optional<AmbulanceRankDto> next = ranked.stream()
                .filter(r -> !alreadyTried.contains(r.getAmbulanceId()))
                .findFirst();
        if (next.isPresent()) {
            createDispatchOffer(emergencyId, next.get().getAmbulanceId());
            return;
        }
        escalate(emergencyId);
    }

    @Transactional
    public void escalate(String emergencyId) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId).orElseThrow();
        eCase.setCurrentState("ESCALATED");
        eCase.setUpdatedAt(Instant.now());
        emergencyCaseRepository.save(eCase);
        writeAudit("ESCALATION", "SYSTEM", emergencyId, "EMERGENCY",
                "No eligible ambulance after filter/shortlist/expiry");
        webSocketNotificationService.broadcastEvent("/topic/alerts", "mission.escalated", emergencyId, eCase);
    }

    @Transactional
    public DispatchOffer autoDispatchTop(String emergencyId) {
        if (!autoEnabled) {
            throw new IllegalStateException("Auto-dispatch disabled");
        }
        List<DispatchOffer> alreadyOpen = dispatchOfferRepository.findByEmergencyIdAndStatus(emergencyId, "OFFERED");
        if (!alreadyOpen.isEmpty()) return alreadyOpen.get(0);
        if (missionRepository.findByEmergencyId(emergencyId).isPresent()) return null;
        List<AmbulanceRankDto> ranked;
        try {
            ranked = shortlistAndRankAmbulances(emergencyId);
        } catch (RoutingProviderUnavailableException exception) {
            escalateForRoutingProviderUnavailable(emergencyId, exception);
            return null;
        }
        if (ranked.isEmpty()) {
            escalate(emergencyId);
            return null;
        }
        return createDispatchOffer(emergencyId, ranked.get(0).getAmbulanceId());
    }

    private void escalateForRoutingProviderUnavailable(String emergencyId,
                                                        RoutingProviderUnavailableException exception) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId).orElseThrow();
        eCase.setCurrentState("ESCALATED");
        eCase.setUpdatedAt(Instant.now());
        emergencyCaseRepository.save(eCase);
        writeAudit("ROUTING_PROVIDER_UNAVAILABLE", "SYSTEM", emergencyId, "EMERGENCY",
                "Automatic dispatch paused; an operator must review routing availability");
        webSocketNotificationService.broadcastEvent("/topic/alerts", "routing.provider_unavailable", emergencyId,
                Map.of("emergencyId", emergencyId, "message", exception.getMessage()));
    }

    private void writeAudit(String type, String role, String aggregateId, String aggregateType, String details) {
        AuditEvent event = new AuditEvent();
        event.setEventId("aud-" + UUID.randomUUID().toString().substring(0, 8));
        event.setEventType(type);
        event.setActorRole(role);
        event.setAggregateId(aggregateId);
        event.setAggregateType(aggregateType);
        event.setDetails(details);
        auditEventRepository.save(event);
    }
}
