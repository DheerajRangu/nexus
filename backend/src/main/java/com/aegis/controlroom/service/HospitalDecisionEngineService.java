package com.aegis.controlroom.service;

import com.aegis.controlroom.dto.HospitalRankDto;
import com.aegis.controlroom.dto.HospitalReservationRequestDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class HospitalDecisionEngineService {

    private final HospitalRepository hospitalRepository;
    private final EmergencyCaseRepository emergencyCaseRepository;
    private final IncidentLocationRepository incidentLocationRepository;
    private final HospitalRequestRepository hospitalRequestRepository;
    private final ReservationRepository reservationRepository;
    private final MissionRepository missionRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    public HospitalDecisionEngineService(HospitalRepository hospitalRepository,
                                         EmergencyCaseRepository emergencyCaseRepository,
                                         IncidentLocationRepository incidentLocationRepository,
                                         HospitalRequestRepository hospitalRequestRepository,
                                         ReservationRepository reservationRepository,
                                         MissionRepository missionRepository,
                                         WebSocketNotificationService webSocketNotificationService) {
        this.hospitalRepository = hospitalRepository;
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.hospitalRequestRepository = hospitalRequestRepository;
        this.reservationRepository = reservationRepository;
        this.missionRepository = missionRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    public List<HospitalRankDto> rankHospitalsForCase(String emergencyId, Integer requiredBeds, Boolean requiredIcu) {
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Case not found"));

        IncidentLocation loc = incidentLocationRepository.findByEmergencyId(emergencyId)
                .orElseThrow(() -> new IllegalStateException("Location not found"));

        double targetLat = loc.getConfirmedLat() != null ? loc.getConfirmedLat() : loc.getCallerLat();
        double targetLng = loc.getConfirmedLng() != null ? loc.getConfirmedLng() : loc.getCallerLng();

        List<Hospital> hospitals = hospitalRepository.findAll();
        List<HospitalRankDto> ranked = new ArrayList<>();

        for (Hospital hosp : hospitals) {
            // Strict Clinician-Confirmed Capacity Filter
            boolean bedAvailable = Boolean.TRUE.equals(requiredIcu) ? (hosp.getAvailableIcu() >= requiredBeds) : (hosp.getAvailableBeds() >= requiredBeds);

            // Freshness check (stale if > 2 hours)
            boolean isFresh = hosp.getResourceUpdatedAt() != null &&
                    hosp.getResourceUpdatedAt().isAfter(Instant.now().minus(2, ChronoUnit.HOURS));

            if (!isFresh) {
                bedAvailable = false; // Stale data cannot count as confirmed availability
            }

            double distKm = calculateHaversineKm(targetLat, targetLng, hosp.getLatitude(), hosp.getLongitude());
            double travelEtaMins = (distKm / 40.0) * 60.0; // ~40 km/h avg speed

            // Resource readiness delay (e.g. Cath lab prep time or ER bed setup)
            double resourceReadyDelayMins = "CRITICAL".equalsIgnoreCase(hosp.getEmergencyWorkload()) ? 15.0 : ("HIGH".equalsIgnoreCase(hosp.getEmergencyWorkload()) ? 8.0 : 2.0);
            double handoverDelayMins = 5.0; // Standard triage signoff delay

            // TRANSPARENT PLANNING ESTIMATE: max(travelEta, resourceReadyDelay) + handoverDelay
            double totalTransparentEstimate = Math.max(travelEtaMins, resourceReadyDelayMins) + handoverDelayMins;

            List<String> reasons = new ArrayList<>();
            reasons.add(String.format("Travel ETA: %.1f mins (%.2f km)", travelEtaMins, distKm));
            reasons.add(String.format("ER Workload: %s (Prep delay: %.0f mins)", hosp.getEmergencyWorkload(), resourceReadyDelayMins));
            reasons.add(String.format("Transparent Planning Estimate: max(%.1f, %.1f) + %.1f = %.1f mins", travelEtaMins, resourceReadyDelayMins, handoverDelayMins, totalTransparentEstimate));

            if (bedAvailable) {
                reasons.add("Confirmed Capacity: " + (requiredIcu ? hosp.getAvailableIcu() + " ICU beds" : hosp.getAvailableBeds() + " General beds") + " available.");
            } else {
                reasons.add(isFresh ? "INSUFFICIENT BEDS: Zero unreserved beds." : "STALE DATA: Resource update > 2 hours old.");
            }

            double score = (100.0 - (totalTransparentEstimate * 1.8)) + (bedAvailable ? 40.0 : -50.0);

            HospitalRankDto rank = new HospitalRankDto();
            rank.setHospitalId(hosp.getHospitalId());
            rank.setName(hosp.getName());
            rank.setTravelEtaMins(Math.round(travelEtaMins * 10.0) / 10.0);
            rank.setResourceReadyDelayMins(resourceReadyDelayMins);
            rank.setHandoverDelayMins(handoverDelayMins);
            rank.setTotalTransparentEstimateMins(Math.round(totalTransparentEstimate * 10.0) / 10.0);
            rank.setAvailableBeds(hosp.getAvailableBeds());
            rank.setAvailableIcu(hosp.getAvailableIcu());
            rank.setSpecialistReady(isFresh && bedAvailable);
            rank.setScore(Math.round(score * 10.0) / 10.0);
            rank.setReasons(reasons);

            ranked.add(rank);
        }

        ranked.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return ranked;
    }

    @Transactional
    public Reservation reserveHospitalBed(HospitalReservationRequestDto dto) {
        Hospital hosp = hospitalRepository.findById(dto.getHospitalId())
                .orElseThrow(() -> new IllegalArgumentException("Hospital not found"));

        // Atomic check and decrement
        if (Boolean.TRUE.equals(dto.getRequiredIcu())) {
            if (hosp.getAvailableIcu() < dto.getRequiredBeds()) {
                throw new IllegalStateException("LAST-BED RACE CONDITION: Requested ICU beds no longer available!");
            }
            hosp.setAvailableIcu(hosp.getAvailableIcu() - dto.getRequiredBeds());
        } else {
            if (hosp.getAvailableBeds() < dto.getRequiredBeds()) {
                throw new IllegalStateException("LAST-BED RACE CONDITION: Requested General beds no longer available!");
            }
            hosp.setAvailableBeds(hosp.getAvailableBeds() - dto.getRequiredBeds());
        }
        hosp.setResourceUpdatedAt(Instant.now());
        hospitalRepository.save(hosp);

        HospitalRequest req = new HospitalRequest();
        req.setRequestId("hreq-" + UUID.randomUUID().toString().substring(0, 8));
        req.setEmergencyId(dto.getEmergencyId());
        req.setHospitalId(dto.getHospitalId());
        req.setRequiredBeds(dto.getRequiredBeds());
        req.setRequiredIcu(Boolean.TRUE.equals(dto.getRequiredIcu()));
        req.setStatus("ACCEPTED");
        req.setRespondedAt(Instant.now());
        hospitalRequestRepository.save(req);

        Reservation res = new Reservation();
        res.setReservationId("res-" + UUID.randomUUID().toString().substring(0, 8));
        res.setRequestId(req.getRequestId());
        res.setHospitalId(dto.getHospitalId());
        res.setEmergencyId(dto.getEmergencyId());
        res.setBedsReserved(dto.getRequiredBeds());
        res.setIcuReserved(Boolean.TRUE.equals(dto.getRequiredIcu()));
        res.setStatus("CONFIRMED");
        res.setExpiresAt(Instant.now().plus(45, ChronoUnit.MINUTES));
        Reservation savedRes = reservationRepository.save(res);

        // Update Emergency Case and Active Mission
        EmergencyCase eCase = emergencyCaseRepository.findById(dto.getEmergencyId()).orElse(null);
        if (eCase != null) {
            eCase.setReservedHospitalId(dto.getHospitalId());
            emergencyCaseRepository.save(eCase);
        }

        Mission mission = missionRepository.findByEmergencyId(dto.getEmergencyId()).orElse(null);
        if (mission != null) {
            mission.setAssignedHospitalId(dto.getHospitalId());
            mission.setHospitalEtaMins(12.5);
            missionRepository.save(mission);
            webSocketNotificationService.broadcastEvent("/topic/missions", "MISSION_HOSPITAL_RESERVED", mission.getMissionId(), mission);
        }

        webSocketNotificationService.broadcastEvent("/topic/hospitals", "HOSPITAL_BED_RESERVED", savedRes.getReservationId(), savedRes);

        return savedRes;
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
