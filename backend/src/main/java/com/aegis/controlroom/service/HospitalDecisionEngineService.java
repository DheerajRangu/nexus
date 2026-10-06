package com.aegis.controlroom.service;

import com.aegis.controlroom.api.DomainConflictException;
import com.aegis.controlroom.dto.HospitalRankDto;
import com.aegis.controlroom.dto.HospitalReservationRequestDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import com.aegis.controlroom.routing.RouteEstimate;
import com.aegis.controlroom.routing.RoadGraphProvider;
import com.aegis.controlroom.routing.GraphRoute;
import org.springframework.beans.factory.annotation.Value;
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
    private final AuditEventRepository auditEventRepository;
    private final RoadGraphProvider roadGraphProvider;
    private final WebSocketNotificationService webSocketNotificationService;

    @Value("${aegis.hospital.snapshot-freshness-seconds:300}")
    private long snapshotFreshnessSeconds;

    public HospitalDecisionEngineService(HospitalRepository hospitalRepository,
                                         EmergencyCaseRepository emergencyCaseRepository,
                                         IncidentLocationRepository incidentLocationRepository,
                                         HospitalRequestRepository hospitalRequestRepository,
                                         ReservationRepository reservationRepository,
                                         MissionRepository missionRepository,
                                       AuditEventRepository auditEventRepository,
                                       RoadGraphProvider roadGraphProvider,
                                       WebSocketNotificationService webSocketNotificationService) {
        this.hospitalRepository = hospitalRepository;
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.hospitalRequestRepository = hospitalRequestRepository;
        this.reservationRepository = reservationRepository;
        this.missionRepository = missionRepository;
        this.auditEventRepository = auditEventRepository;
        this.roadGraphProvider = roadGraphProvider;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    public List<HospitalRankDto> rankHospitalsForCase(String emergencyId, Integer requiredBeds, Boolean requiredIcu) {
        return rankHospitalsForCase(emergencyId, requiredBeds, requiredIcu, List.of());
    }

    public List<HospitalRankDto> rankHospitalsForCase(
            String emergencyId, Integer requiredBeds, Boolean requiredIcu, List<String> requiredCapabilities) {
        emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Case not found"));
        IncidentLocation loc = incidentLocationRepository.findByEmergencyId(emergencyId)
                .orElseThrow(() -> new IllegalStateException("Location not found"));

        Double targetLatValue = loc.getConfirmedLat() != null ? loc.getConfirmedLat() : loc.getCallerLat();
        Double targetLngValue = loc.getConfirmedLng() != null ? loc.getConfirmedLng() : loc.getCallerLng();
        if (targetLatValue == null || targetLngValue == null) {
            return List.of();
        }
        double targetLat = targetLatValue;
        double targetLng = targetLngValue;
        Instant freshest = Instant.now().minus(snapshotFreshnessSeconds, ChronoUnit.SECONDS);
        int beds = requiredBeds != null ? requiredBeds : 1;
        boolean icu = Boolean.TRUE.equals(requiredIcu);
        List<String> caps = requiredCapabilities != null ? requiredCapabilities : List.of();

        List<HospitalRankDto> ranked = new ArrayList<>();
        for (Hospital hosp : hospitalRepository.findAll()) {
            if (!matchesCapabilities(hosp, caps)) {
                continue; // filter BEFORE ranking
            }

            boolean fresh = hosp.getResourceUpdatedAt() != null && !hosp.getResourceUpdatedAt().isBefore(freshest);
            int freeBeds = Math.max(0, hosp.getAvailableBeds() - (hosp.getReservedBeds() != null ? hosp.getReservedBeds() : 0));
            int freeIcu = hosp.getAvailableIcu() != null ? hosp.getAvailableIcu() : 0;
            boolean capacityOk = icu ? freeIcu >= beds : freeBeds >= beds;

            String availability = (!fresh || !capacityOk) ? "UNKNOWN" : "AVAILABLE";
            if (!fresh || !capacityOk) {
                // Stale/unknown never count as available; still may appear with UNKNOWN for transparency
                // but are not ranked for selection — exclude from ranked list
                continue;
            }

            Optional<GraphRoute> availableRoute = roadGraphProvider.routeAvoidingBlocks(
                    targetLat, targetLng, hosp.getLatitude(), hosp.getLongitude());
            if (availableRoute.isEmpty()) continue;
            GraphRoute graphRoute = availableRoute.get();
            RouteEstimate travel = new RouteEstimate(graphRoute.distanceKm(), graphRoute.etaMins(),
                    graphRoute.provider(), graphRoute.simulated());
            double travelEta = travel.etaMins();
            double resourceReady = workloadDelay(hosp.getEmergencyWorkload());
            double handover = 5.0;
            double total = Math.max(travelEta, resourceReady) + handover;

            List<String> assumptions = List.of(
                    "travel_eta_mins=" + travelEta,
                    "resource_ready_delay_mins=" + resourceReady,
                    "handover_delay_mins=" + handover,
                    "formula=max(travel_eta, resource_ready)+handover",
                    "routing=" + travel.provider() + (travel.simulated() ? " SIMULATED" : ""),
                    "no_guaranteed_treatment_or_survival_claim"
            );

            List<String> reasons = new ArrayList<>();
            reasons.add("Clinician-confirmed capacity OK (" + (icu ? freeIcu + " ICU" : freeBeds + " beds") + ")");
            reasons.add("Workload=" + hosp.getEmergencyWorkload());
            reasons.add(String.format("Estimate max(%.1f, %.1f)+%.1f = %.1f mins", travelEta, resourceReady, handover, total));

            double score = 100.0 - (total * 1.5);
            if ("NORMAL".equalsIgnoreCase(hosp.getEmergencyWorkload())) {
                score += 10;
            }

            HospitalRankDto rank = new HospitalRankDto();
            rank.setHospitalId(hosp.getHospitalId());
            rank.setName(hosp.getName());
            rank.setTravelEtaMins(travelEta);
            rank.setResourceReadyDelayMins(resourceReady);
            rank.setHandoverDelayMins(handover);
            rank.setTotalTransparentEstimateMins(Math.round(total * 10.0) / 10.0);
            rank.setAvailableBeds(freeBeds);
            rank.setAvailableIcu(freeIcu);
            rank.setSpecialistReady(true);
            rank.setScore(Math.round(score * 10.0) / 10.0);
            rank.setReasons(reasons);
            rank.setAssumptions(assumptions);
            rank.setAvailabilityStatus(availability);
            ranked.add(rank);
        }

        ranked.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return ranked;
    }

    /** Returns UNKNOWN-labelled hospitals that were filtered for freshness (for UI honesty). */
    public List<HospitalRankDto> unknownStaleSnapshots(String emergencyId) {
        Instant freshest = Instant.now().minus(snapshotFreshnessSeconds, ChronoUnit.SECONDS);
        List<HospitalRankDto> out = new ArrayList<>();
        for (Hospital hosp : hospitalRepository.findAll()) {
            boolean fresh = hosp.getResourceUpdatedAt() != null && !hosp.getResourceUpdatedAt().isBefore(freshest);
            if (fresh) {
                continue;
            }
            HospitalRankDto dto = new HospitalRankDto();
            dto.setHospitalId(hosp.getHospitalId());
            dto.setName(hosp.getName());
            dto.setAvailabilityStatus("UNKNOWN");
            dto.setAvailableBeds(null);
            dto.setReasons(List.of("STALE snapshot — never counted as available"));
            dto.setAssumptions(List.of("freshness_limit_seconds=" + snapshotFreshnessSeconds));
            out.add(dto);
        }
        return out;
    }

    private static boolean matchesCapabilities(Hospital hosp, List<String> caps) {
        for (String cap : caps) {
            if ("TRAUMA_CENTER".equalsIgnoreCase(cap) && !Boolean.TRUE.equals(hosp.getHasTraumaCenter())) {
                return false;
            }
            if ("CARDIAC_CATH_LAB".equalsIgnoreCase(cap) && !Boolean.TRUE.equals(hosp.getHasCardiacCathLab())) {
                return false;
            }
        }
        return true;
    }

    private static double workloadDelay(String workload) {
        if ("CRITICAL".equalsIgnoreCase(workload)) {
            return 15.0;
        }
        if ("HIGH".equalsIgnoreCase(workload)) {
            return 8.0;
        }
        return 2.0;
    }

    @Transactional
    public Reservation reserveHospitalBed(HospitalReservationRequestDto dto) {
        int beds = dto.getRequiredBeds() != null ? dto.getRequiredBeds() : 1;
        int updated = hospitalRepository.reserveBedsIfAvailable(dto.getHospitalId(), beds);
        if (updated != 1) {
            throw new DomainConflictException("No beds remaining for hospital " + dto.getHospitalId());
        }

        HospitalRequest req = new HospitalRequest();
        req.setRequestId("hreq-" + UUID.randomUUID().toString().substring(0, 8));
        req.setEmergencyId(dto.getEmergencyId());
        req.setHospitalId(dto.getHospitalId());
        req.setRequiredBeds(beds);
        req.setRequiredIcu(Boolean.TRUE.equals(dto.getRequiredIcu()));
        req.setStatus("ACCEPTED_BY_HOSPITAL");
        req.setRespondedAt(Instant.now());
        hospitalRequestRepository.save(req);

        Reservation res = new Reservation();
        res.setReservationId("res-" + UUID.randomUUID().toString().substring(0, 8));
        res.setRequestId(req.getRequestId());
        res.setHospitalId(dto.getHospitalId());
        res.setEmergencyId(dto.getEmergencyId());
        res.setBedsReserved(beds);
        res.setIcuReserved(Boolean.TRUE.equals(dto.getRequiredIcu()));
        res.setStatus("RESERVED");
        res.setExpiresAt(Instant.now().plus(45, ChronoUnit.MINUTES));
        Reservation savedRes = reservationRepository.save(res);

        EmergencyCase eCase = emergencyCaseRepository.findById(dto.getEmergencyId()).orElse(null);
        if (eCase != null) {
            eCase.setReservedHospitalId(dto.getHospitalId());
            emergencyCaseRepository.save(eCase);
        }

        Mission mission = missionRepository.findByEmergencyId(dto.getEmergencyId()).orElse(null);
        if (mission != null) {
            mission.setAssignedHospitalId(dto.getHospitalId());
            missionRepository.save(mission);
        }

        webSocketNotificationService.broadcastEvent("/topic/hospitals", "reservation.reserved", savedRes.getReservationId(), savedRes);
        return savedRes;
    }

    @Transactional
    public Reservation consumeReservationForEmergency(String emergencyId) {
        Reservation res = reservationRepository.findByEmergencyIdAndStatus(emergencyId, "RESERVED")
                .orElseThrow(() -> new DomainConflictException("No RESERVED reservation to consume for " + emergencyId));
        int beds = res.getBedsReserved() != null ? res.getBedsReserved() : 1;
        int updated = hospitalRepository.consumeReservedBeds(res.getHospitalId(), beds);
        if (updated != 1) {
            throw new DomainConflictException("Failed to consume reserved beds for " + res.getHospitalId());
        }
        res.setStatus("CONSUMED");
        Reservation saved = reservationRepository.save(res);
        webSocketNotificationService.broadcastEvent(
                "/topic/hospitals", "reservation.consumed", saved.getReservationId(), saved);
        return saved;
    }

    @Transactional
    public void changeDestination(String emergencyId, String newHospitalId, String operatorId, String confirmation) {
        if (confirmation == null || confirmation.isBlank()) {
            throw new IllegalArgumentException("Operator confirmation required for destination change");
        }
        EmergencyCase eCase = emergencyCaseRepository.findById(emergencyId)
                .orElseThrow(() -> new IllegalArgumentException("Case not found"));
        eCase.setReservedHospitalId(newHospitalId);
        emergencyCaseRepository.save(eCase);
        AuditEvent audit = new AuditEvent();
        audit.setEventId("aud-" + UUID.randomUUID().toString().substring(0, 8));
        audit.setEventType("DESTINATION_CHANGE");
        audit.setActorId(operatorId);
        audit.setActorRole("OPERATOR");
        audit.setAggregateId(emergencyId);
        audit.setAggregateType("EMERGENCY");
        audit.setDetails("Confirmed destination change to " + newHospitalId + ": " + confirmation);
        auditEventRepository.save(audit);
    }
}
