package com.aegis.controlroom.service;

import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
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
    private final AIServiceClient aiServiceClient;
    private final WebSocketNotificationService webSocketNotificationService;

    public DispatchEngineService(AmbulanceRepository ambulanceRepository,
                                 EmergencyCaseRepository emergencyCaseRepository,
                                 IncidentLocationRepository incidentLocationRepository,
                                 DispatchOfferRepository dispatchOfferRepository,
                                 MissionRepository missionRepository,
                                 AIServiceClient aiServiceClient,
                                 WebSocketNotificationService webSocketNotificationService) {
        this.ambulanceRepository = ambulanceRepository;
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.dispatchOfferRepository = dispatchOfferRepository;
        this.missionRepository = missionRepository;
        this.aiServiceClient = aiServiceClient;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    public List<AmbulanceRankDto> shortlistAndRankAmbulances(String emergencyId) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Emergency case not found: " + emergencyId));

        IncidentLocation loc = incidentLocationRepository.findByEmergencyId(emergencyId)
                .orElseThrow(() -> new IllegalStateException("Incident location not recorded"));

        double targetLat = loc.getConfirmedLat() != null ? loc.getConfirmedLat() : loc.getCallerLat();
        double targetLng = loc.getConfirmedLng() != null ? loc.getConfirmedLng() : loc.getCallerLng();

        List<Ambulance> available = ambulanceRepository.findByIsAvailableTrue();
        List<AmbulanceRankDto> ranked = new ArrayList<>();

        for (Ambulance amb : available) {
            // Capability filter
            boolean capabilityMatch = true;
            if ("P1_CRITICAL".equals(eCase.getTriagePriority()) && !"ALS".equalsIgnoreCase(amb.getCapabilityTier())) {
                capabilityMatch = false; // ALS required for P1
            }

            double distKm = calculateHaversineKm(targetLat, targetLng, amb.getLatitude(), amb.getLongitude());
            double baseEtaMins = (distKm / 35.0) * 60.0; // ~35 km/h avg speed
            double correctedEtaMins = aiServiceClient.predictCorrectedETA(distKm, baseEtaMins, "MODERATE");

            List<String> reasons = new ArrayList<>();
            reasons.add(String.format("Distance to incident: %.2f km", distKm));
            reasons.add(String.format("Traffic-adjusted ETA: %.1f mins (base: %.1f mins)", correctedEtaMins, baseEtaMins));

            if (capabilityMatch) {
                reasons.add("Capability Match: " + amb.getCapabilityTier() + " unit equipped.");
            } else {
                reasons.add("Sub-optimal capability match for P1 critical incident.");
            }

            double score = (100.0 - (distKm * 2.0) - (correctedEtaMins * 1.5)) + (capabilityMatch ? 30.0 : 0.0);

            AmbulanceRankDto rank = new AmbulanceRankDto();
            rank.setAmbulanceId(amb.getAmbulanceId());
            rank.setLicensePlate(amb.getLicensePlate());
            rank.setCapabilityTier(amb.getCapabilityTier());
            rank.setDistanceKm(Math.round(distKm * 100.0) / 100.0);
            rank.setRawEtaMins(Math.round(baseEtaMins * 10.0) / 10.0);
            rank.setCorrectedEtaMins(correctedEtaMins);
            rank.setScore(Math.round(score * 10.0) / 10.0);
            rank.setReasons(reasons);
            rank.setDriverId(amb.getAssignedDriverId() != null ? amb.getAssignedDriverId() : "usr-drv-01");

            ranked.add(rank);
        }

        ranked.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return ranked;
    }

    @Transactional
    public DispatchOffer createDispatchOffer(String emergencyId, String ambulanceId) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Case not found"));

        Ambulance amb = ambulanceRepository.findById(ambulanceId)
                .orElseThrow(() -> new IllegalArgumentException("Ambulance not found"));

        if (!amb.getIsAvailable()) {
            throw new IllegalStateException("Ambulance is currently unavailable");
        }

        String driverId = amb.getAssignedDriverId() != null ? amb.getAssignedDriverId() : "usr-drv-01";

        DispatchOffer offer = new DispatchOffer();
        offer.setOfferId("off-" + UUID.randomUUID().toString().substring(0, 8));
        offer.setEmergencyId(emergencyId);
        offer.setAmbulanceId(ambulanceId);
        offer.setDriverId(driverId);
        offer.setStatus("OFFERED");
        offer.setOfferedAt(Instant.now());
        offer.setExpiresAt(Instant.now().plus(30, ChronoUnit.SECONDS)); // 30s TTL

        DispatchOffer saved = dispatchOfferRepository.save(offer);

        eCase.setCurrentState("DISPATCHING");
        eCase.setUpdatedAt(Instant.now());
        emergencyCaseRepository.save(eCase);

        webSocketNotificationService.broadcastEvent("/topic/offers", "DISPATCH_OFFER_CREATED", saved.getOfferId(), saved);
        webSocketNotificationService.broadcastEvent("/topic/cases", "CASE_DISPATCHING", emergencyId, eCase);
        return saved;
    }

    @Transactional
    public Mission respondToOffer(String offerId, String action) {
        DispatchOffer offer = dispatchOfferRepository.findById(offerId)
                .orElseThrow(() -> new IllegalArgumentException("Dispatch offer not found"));

        if (!"OFFERED".equals(offer.getStatus())) {
            throw new IllegalStateException("Offer is no longer active. Current status: " + offer.getStatus());
        }

        if (Instant.now().isAfter(offer.getExpiresAt())) {
            offer.setStatus("EXPIRED");
            dispatchOfferRepository.save(offer);
            throw new IllegalStateException("Dispatch offer expired after 30 seconds.");
        }

        if ("DECLINE".equalsIgnoreCase(action)) {
            offer.setStatus("DECLINED");
            offer.setRespondedAt(Instant.now());
            dispatchOfferRepository.save(offer);

            // Re-queue case
            EmergencyCase eCase = emergencyCaseRepository.findById(offer.getEmergencyId()).orElse(null);
            if (eCase != null) {
                eCase.setCurrentState("LOCATION_CONFIRMED");
                emergencyCaseRepository.save(eCase);
            }

            webSocketNotificationService.broadcastEvent("/topic/offers", "OFFER_DECLINED", offerId, offer);
            return null;
        }

        // ACCEPT ACTION - ATOMIC ASSIGNMENT
        offer.setStatus("ACCEPTED");
        offer.setRespondedAt(Instant.now());
        dispatchOfferRepository.save(offer);

        // Pessimistic lock ambulance row to guarantee atomic assignment
        Ambulance ambulance = ambulanceRepository.findByIdForUpdate(offer.getAmbulanceId())
                .orElseThrow(() -> new IllegalStateException("Ambulance row unavailable"));

        if (!ambulance.getIsAvailable()) {
            throw new IllegalStateException("Race condition detected: Ambulance already assigned to competing mission!");
        }

        ambulance.setIsAvailable(false);
        ambulance.setStatus("ASSIGNED");
        ambulanceRepository.save(ambulance);

        EmergencyCase eCase = emergencyCaseRepository.findById(offer.getEmergencyId()).orElseThrow();
        eCase.setCurrentState("DISPATCHED");
        eCase.setAssignedAmbulanceId(ambulance.getAmbulanceId());
        eCase.setUpdatedAt(Instant.now());
        emergencyCaseRepository.save(eCase);

        Mission mission = new Mission();
        mission.setMissionId("msn-" + UUID.randomUUID().toString().substring(0, 8));
        mission.setEmergencyId(eCase.getEmergencyId());
        mission.setAmbulanceId(ambulance.getAmbulanceId());
        mission.setDriverId(offer.getDriverId());
        mission.setCurrentState("DISPATCHED");
        mission.setPickupEtaMins(8.5);

        Mission savedMission = missionRepository.save(mission);

        webSocketNotificationService.broadcastEvent("/topic/missions", "MISSION_DISPATCHED", savedMission.getMissionId(), savedMission);
        webSocketNotificationService.broadcastEvent("/topic/cases", "CASE_DISPATCHED", eCase.getEmergencyId(), eCase);

        return savedMission;
    }

    @Scheduled(fixedRate = 5000)
    @Transactional
    public void checkExpiredOffers() {
        List<DispatchOffer> activeOffers = dispatchOfferRepository.findAll();
        for (DispatchOffer offer : activeOffers) {
            if ("OFFERED".equals(offer.getStatus()) && Instant.now().isAfter(offer.getExpiresAt())) {
                offer.setStatus("EXPIRED");
                dispatchOfferRepository.save(offer);

                EmergencyCase eCase = emergencyCaseRepository.findById(offer.getEmergencyId()).orElse(null);
                if (eCase != null && "DISPATCHING".equals(eCase.getCurrentState())) {
                    eCase.setCurrentState("LOCATION_CONFIRMED");
                    emergencyCaseRepository.save(eCase);
                }

                webSocketNotificationService.broadcastEvent("/topic/offers", "OFFER_EXPIRED", offer.getOfferId(), offer);
            }
        }
    }

    private double calculateHaversineKm(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}
