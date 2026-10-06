package com.aegis.controlroom.service;

import com.aegis.controlroom.api.DomainConflictException;
import com.aegis.controlroom.demo.DemoInjection;
import com.aegis.controlroom.demo.DemoInjectionStore;
import com.aegis.controlroom.dto.*;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Plays the hackathon demo via real service calls only (no direct lifecycle state writes).
 */
@Service
@Profile("demo")
public class DemoScenarioService {

    private final DemoResetService demoResetService;
    private final DemoInjectionStore injectionStore;
    private final IntakeService intakeService;
    private final DispatchEngineService dispatchEngineService;
    private final MissionStateMachineService missionStateMachineService;
    private final HospitalDecisionEngineService hospitalDecisionEngineService;
    private final RoutingService routingService;
    private final CitizenTrackingService citizenTrackingService;
    private final AIServiceClient aiServiceClient;
    private final RoadblockRepository roadblockRepository;
    private final DispatchOfferRepository dispatchOfferRepository;
    private final ReservationRepository reservationRepository;
    private final MissionRepository missionRepository;
    private final HospitalRepository hospitalRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    @Value("${aegis.demo.step-delay-ms:1500}")
    private long stepDelayMs;

    public DemoScenarioService(DemoResetService demoResetService,
                               DemoInjectionStore injectionStore,
                               IntakeService intakeService,
                               DispatchEngineService dispatchEngineService,
                               MissionStateMachineService missionStateMachineService,
                               HospitalDecisionEngineService hospitalDecisionEngineService,
                               RoutingService routingService,
                               CitizenTrackingService citizenTrackingService,
                               AIServiceClient aiServiceClient,
                               RoadblockRepository roadblockRepository,
                               DispatchOfferRepository dispatchOfferRepository,
                               ReservationRepository reservationRepository,
                               MissionRepository missionRepository,
                               HospitalRepository hospitalRepository,
                               WebSocketNotificationService webSocketNotificationService) {
        this.demoResetService = demoResetService;
        this.injectionStore = injectionStore;
        this.intakeService = intakeService;
        this.dispatchEngineService = dispatchEngineService;
        this.missionStateMachineService = missionStateMachineService;
        this.hospitalDecisionEngineService = hospitalDecisionEngineService;
        this.routingService = routingService;
        this.citizenTrackingService = citizenTrackingService;
        this.aiServiceClient = aiServiceClient;
        this.roadblockRepository = roadblockRepository;
        this.dispatchOfferRepository = dispatchOfferRepository;
        this.reservationRepository = reservationRepository;
        this.missionRepository = missionRepository;
        this.hospitalRepository = hospitalRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    public Map<String, Object> inject(String kind) {
        DemoInjection injection = switch (kind == null ? "" : kind.trim()) {
            case "driverRejection" -> DemoInjection.DRIVER_REJECTION;
            case "fullHospital" -> DemoInjection.FULL_HOSPITAL;
            case "competingAssignments" -> DemoInjection.COMPETING_ASSIGNMENTS;
            case "aiDown" -> DemoInjection.AI_DOWN;
            default -> throw new IllegalArgumentException(
                    "Unknown inject kind. Use driverRejection|fullHospital|competingAssignments|aiDown");
        };
        injectionStore.set(injection);
        Map<String, Object> body = Map.of("pendingInjection", injection.name());
        webSocketNotificationService.broadcastEvent("/topic/system", "DEMO_INJECT", "SYSTEM", body);
        return body;
    }

    public Map<String, Object> runScenario() {
        DemoInjection injection = injectionStore.consume();
        List<Map<String, Object>> steps = new ArrayList<>();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("injection", injection.name());

        if (injection == DemoInjection.AI_DOWN) {
            aiServiceClient.setForceFallback(true);
        }

        try {
            ManualIntakeRequestDto intake = new ManualIntakeRequestDto();
            intake.setCallbackNumber("9000111222");
            intake.setChiefComplaint("TRAUMA");
            intake.setPriority("P2_URGENT");
            intake.setNotes(injection == DemoInjection.AI_DOWN
                    ? "Demo call with AI forced down"
                    : "Demo: accident with bleeding near MG Road");
            intake.setAddressLandmark("MG Road Junction");
            intake.setProvisionalDispatch(true);
            EmergencyCase eCase = intakeService.processManualIntake(intake);
            String emergencyId = eCase.getEmergencyId();
            step(steps, "CALL_INTAKE", Map.of("emergencyId", emergencyId));

            if (injection == DemoInjection.AI_DOWN) {
                Map<String, Object> nlp = aiServiceClient.parseNotesNLP(intake.getNotes());
                result.put("aiStatus", nlp.get("aiStatus"));
                step(steps, "AI_STATUS", Map.of("aiStatus", nlp.get("aiStatus")));
            }

            LocationConfirmDto loc = new LocationConfirmDto();
            loc.setLatitude(12.9716);
            loc.setLongitude(77.5946);
            loc.setAccuracyMeters(25.0);
            loc.setAddress("MG Road Junction");
            loc.setConfirmedBy("CITIZEN_PINPOINT");
            intakeService.confirmLocation(emergencyId, loc);
            step(steps, "LOCATION_CONFIRMED", Map.of("lat", 12.9716, "lng", 77.5946));

            List<AmbulanceRankDto> ranked = dispatchEngineService.shortlistAndRankAmbulances(emergencyId);
            if (ranked.isEmpty()) {
                throw new IllegalStateException("No ranked ambulances for demo scenario");
            }
            step(steps, "AMBULANCE_SHORTLIST", Map.of("count", ranked.size(), "top", ranked.get(0).getAmbulanceId()));

            Mission mission = assignAmbulance(emergencyId, ranked, injection, steps, result);

            Map<String, Object> tracking = citizenTrackingService.snapshotForEmergency(emergencyId);
            step(steps, "CITIZEN_TRACKING", Map.of("caseState", tracking.get("caseState")));

            missionStateMachineService.transitionMissionState(mission.getMissionId(), "EN_ROUTE_TO_PATIENT");
            step(steps, "EN_ROUTE_TO_PATIENT", Map.of("missionId", mission.getMissionId()));
            missionStateMachineService.transitionMissionState(mission.getMissionId(), "ON_SCENE");
            step(steps, "ON_SCENE", Map.of("missionId", mission.getMissionId()));

            String topBeforeInject = hospitalDecisionEngineService.rankHospitalsForCase(emergencyId, 1, false)
                    .stream().findFirst().map(HospitalRankDto::getHospitalId).orElse(null);
            if (injection == DemoInjection.FULL_HOSPITAL && topBeforeInject != null) {
                Hospital full = hospitalRepository.findById(topBeforeInject).orElseThrow();
                full.setAvailableBeds(0);
                full.setReservedBeds(0);
                full.setResourceUpdatedAt(Instant.now());
                hospitalRepository.save(full);
            }

            List<HospitalRankDto> hospitals = hospitalDecisionEngineService.rankHospitalsForCase(emergencyId, 1, false);
            step(steps, "HOSPITAL_COMPARISON", Map.of(
                    "ranked", hospitals.size(),
                    "top", hospitals.isEmpty() ? "NONE" : hospitals.get(0).getHospitalId()));

            if (hospitals.isEmpty()) {
                result.put("hospitalAlert", "NO_ACCEPTING_HOSPITAL");
                step(steps, "HOSPITAL_ALERT", Map.of("alert", "NO_ACCEPTING_HOSPITAL"));
                throw new IllegalStateException("No accepting hospital after fullHospital injection");
            }
            if (injection == DemoInjection.FULL_HOSPITAL && topBeforeInject != null) {
                result.put("skippedFullHospital", topBeforeInject);
                result.put("nextHospitalId", hospitals.get(0).getHospitalId());
            }

            HospitalReservationRequestDto resDto = new HospitalReservationRequestDto();
            resDto.setEmergencyId(emergencyId);
            resDto.setHospitalId(hospitals.get(0).getHospitalId());
            resDto.setRequiredBeds(1);
            Reservation reservation = hospitalDecisionEngineService.reserveHospitalBed(resDto);
            result.put("hospitalId", reservation.getHospitalId());
            step(steps, "HOSPITAL_RESERVED", Map.of(
                    "reservationId", reservation.getReservationId(),
                    "hospitalId", reservation.getHospitalId()));

            missionStateMachineService.transitionMissionState(mission.getMissionId(), "TRANSPORTING");
            step(steps, "TRANSPORTING", Map.of("missionId", mission.getMissionId()));

            Roadblock rb = new Roadblock();
            rb.setRoadblockId("rb-demo-01");
            rb.setSource("DEMO_TRAFFIC");
            rb.setLatitude(12.9800);
            rb.setLongitude(77.6100);
            rb.setRadiusMeters(80.0);
            rb.setVerified(true);
            rb.setExpiresAt(Instant.now().plus(1, ChronoUnit.HOURS));
            roadblockRepository.save(rb);
            Map<String, Object> route = routingService.calculateRoute(
                    mission.getMissionId(), "PATIENT_TO_HOSPITAL",
                    12.9716, 77.5946, 12.9352, 77.6245);
            step(steps, "ROADBLOCK_REROUTE", Map.of(
                    "routeAvailable", route.get("routeAvailable"),
                    "simulated", route.getOrDefault("simulated", true)));

            missionStateMachineService.transitionMissionState(mission.getMissionId(), "AT_HOSPITAL");
            step(steps, "AT_HOSPITAL", Map.of("missionId", mission.getMissionId()));
            missionStateMachineService.transitionMissionState(mission.getMissionId(), "HANDED_OVER");
            step(steps, "HANDED_OVER", Map.of("missionId", mission.getMissionId()));
            missionStateMachineService.transitionMissionState(mission.getMissionId(), "COMPLETED");
            step(steps, "COMPLETED", Map.of("missionId", mission.getMissionId()));

            Mission finalMission = missionRepository.findById(mission.getMissionId()).orElseThrow();
            Reservation finalRes = reservationRepository.findById(reservation.getReservationId()).orElseThrow();
            result.put("missionState", finalMission.getCurrentState());
            result.put("reservationStatus", finalRes.getStatus());
            result.put("emergencyId", emergencyId);
            result.put("missionId", finalMission.getMissionId());
            result.put("steps", steps);
            result.put("fingerprint", demoResetService.fingerprint());
            return result;
        } finally {
            aiServiceClient.setForceFallback(false);
        }
    }

    private Mission assignAmbulance(
            String emergencyId,
            List<AmbulanceRankDto> ranked,
            DemoInjection injection,
            List<Map<String, Object>> steps,
            Map<String, Object> result) {
        if (injection == DemoInjection.DRIVER_REJECTION) {
            if (ranked.size() < 2) {
                throw new IllegalStateException("driverRejection requires >= 2 ranked ambulances");
            }
            DispatchOffer first = openOrCreateOffer(emergencyId, ranked.get(0).getAmbulanceId());
            dispatchEngineService.respondToOffer(first.getOfferId(), "DECLINE");
            step(steps, "DRIVER_REJECTION", Map.of("declined", ranked.get(0).getAmbulanceId()));
            List<DispatchOffer> open = dispatchOfferRepository.findByEmergencyIdAndStatus(emergencyId, "OFFERED");
            DispatchOffer next = open.isEmpty()
                    ? dispatchEngineService.createDispatchOffer(emergencyId, ranked.get(1).getAmbulanceId())
                    : open.get(0);
            Mission mission = dispatchEngineService.respondToOffer(next.getOfferId(), "ACCEPT");
            result.put("acceptedAmbulanceId", mission.getAmbulanceId());
            step(steps, "AMBULANCE_ACCEPTED", Map.of("ambulanceId", mission.getAmbulanceId()));
            return mission;
        }
        if (injection == DemoInjection.COMPETING_ASSIGNMENTS) {
            DispatchOffer offer = openOrCreateOffer(emergencyId, ranked.get(0).getAmbulanceId());
            int wins = raceAccept(offer.getOfferId(), 8);
            result.put("competingWinners", wins);
            Mission mission = missionRepository.findByEmergencyId(emergencyId)
                    .orElseThrow(() -> new IllegalStateException("No mission after competing accept"));
            step(steps, "COMPETING_ASSIGNMENTS", Map.of("winners", wins, "missionId", mission.getMissionId()));
            return mission;
        }
        DispatchOffer offer = openOrCreateOffer(emergencyId, ranked.get(0).getAmbulanceId());
        Mission mission = dispatchEngineService.respondToOffer(offer.getOfferId(), "ACCEPT");
        step(steps, "AMBULANCE_ACCEPTED", Map.of("ambulanceId", mission.getAmbulanceId()));
        return mission;
    }

    private DispatchOffer openOrCreateOffer(String emergencyId, String ambulanceId) {
        return dispatchOfferRepository.findByEmergencyIdAndAmbulanceIdAndStatus(emergencyId, ambulanceId, "OFFERED")
                .orElseGet(() -> dispatchEngineService.createDispatchOffer(emergencyId, ambulanceId));
    }

    private int raceAccept(String offerId, int n) {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger wins = new AtomicInteger();
        for (int i = 0; i < n; i++) {
            pool.submit(() -> {
                ready.countDown();
                try {
                    start.await(5, TimeUnit.SECONDS);
                    dispatchEngineService.respondToOffer(offerId, "ACCEPT");
                    wins.incrementAndGet();
                } catch (DomainConflictException | InterruptedException ignored) {
                } catch (Exception ignored) {
                }
            });
        }
        try {
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();
            pool.shutdown();
            pool.awaitTermination(20, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return wins.get();
    }

    private void step(List<Map<String, Object>> steps, String name, Map<String, Object> detail) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("step", name);
        row.put("detail", detail);
        row.put("at", Instant.now().toString());
        steps.add(row);
        webSocketNotificationService.broadcastEvent("/topic/demo", "demo.step", name, row);
        if (stepDelayMs > 0) {
            try {
                Thread.sleep(stepDelayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
