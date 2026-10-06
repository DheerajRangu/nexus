package com.aegis.controlroom.hospital;

import com.aegis.controlroom.api.DomainConflictException;
import com.aegis.controlroom.dto.HospitalRankDto;
import com.aegis.controlroom.dto.HospitalReservationRequestDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import com.aegis.controlroom.service.HospitalDecisionEngineService;
import com.aegis.controlroom.service.RoutingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class HospitalC2Test {

    @Autowired HospitalDecisionEngineService hospitalService;
    @Autowired RoutingService routingService;
    @Autowired HospitalRepository hospitals;
    @Autowired EmergencyCaseRepository cases;
    @Autowired IncidentLocationRepository locations;
    @Autowired ReservationRepository reservations;
    @Autowired RoadblockRepository roadblocks;
    @Autowired AuditEventRepository audits;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM route_versions WHERE mission_id LIKE 'msn-c2-%'");
        jdbc.update("DELETE FROM reservations WHERE emergency_id LIKE 'emg-c2-%'");
        jdbc.update("DELETE FROM hospital_requests WHERE emergency_id LIKE 'emg-c2-%'");
        jdbc.update("DELETE FROM incident_locations WHERE emergency_id LIKE 'emg-c2-%'");
        jdbc.update("DELETE FROM emergency_cases WHERE emergency_id LIKE 'emg-c2-%'");
        jdbc.update("DELETE FROM roadblocks");
        jdbc.update("DELETE FROM audit_events WHERE aggregate_id LIKE 'msn-c2-%' OR aggregate_id LIKE 'emg-c2-%'");
        jdbc.update("DELETE FROM hospitals WHERE hospital_id LIKE 'hosp-c2-%'");
    }

    @Test
    void parallelReservations_onOneBed_exactlyOneWinner() throws Exception {
        seedHospital("hosp-c2-race", 1, 0, true, true, Instant.now());
        int n = 8;
        for (int i = 0; i < n; i++) {
            seedCase("emg-c2-race-" + i);
        }
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger wins = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        for (int i = 0; i < n; i++) {
            final int idx = i;
            pool.submit(() -> {
                ready.countDown();
                try {
                    start.await(5, TimeUnit.SECONDS);
                    HospitalReservationRequestDto dto = new HospitalReservationRequestDto();
                    dto.setEmergencyId("emg-c2-race-" + idx);
                    dto.setHospitalId("hosp-c2-race");
                    dto.setRequiredBeds(1);
                    hospitalService.reserveHospitalBed(dto);
                    wins.incrementAndGet();
                } catch (DomainConflictException ex) {
                    conflicts.incrementAndGet();
                } catch (Exception ignored) {
                }
            });
        }
        assertTrue(ready.await(5, TimeUnit.SECONDS));
        start.countDown();
        pool.shutdown();
        assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS));

        assertEquals(1, wins.get());
        assertEquals(n - 1, conflicts.get());
        Hospital h = hospitals.findById("hosp-c2-race").orElseThrow();
        assertTrue(h.getReservedBeds() <= h.getAvailableBeds());
        assertEquals(1, h.getReservedBeds());
        assertEquals(1, reservations.findAll().stream().filter(r -> "hosp-c2-race".equals(r.getHospitalId())).count());
    }

    @Test
    void staleSnapshot_neverReturnedAsAvailable() {
        seedHospital("hosp-c2-stale", 10, 0, true, false, Instant.now().minus(1, ChronoUnit.HOURS));
        seedHospital("hosp-c2-fresh", 5, 0, true, false, Instant.now());
        seedCase("emg-c2-stale");
        List<HospitalRankDto> ranks = hospitalService.rankHospitalsForCase("emg-c2-stale", 1, false);
        assertTrue(ranks.stream().noneMatch(r -> "hosp-c2-stale".equals(r.getHospitalId())));
        assertTrue(ranks.stream().anyMatch(r -> "hosp-c2-fresh".equals(r.getHospitalId())
                && "AVAILABLE".equals(r.getAvailabilityStatus())));
        List<HospitalRankDto> unknowns = hospitalService.unknownStaleSnapshots("emg-c2-stale");
        assertTrue(unknowns.stream().anyMatch(u -> "UNKNOWN".equals(u.getAvailabilityStatus())
                && "hosp-c2-stale".equals(u.getHospitalId())));
    }

    @Test
    void missingCapability_filteredBeforeRanking() {
        seedHospital("hosp-c2-notrauma", 8, 0, false, false, Instant.now());
        seedHospital("hosp-c2-trauma", 8, 0, true, false, Instant.now());
        seedCase("emg-c2-cap");
        List<HospitalRankDto> ranks = hospitalService.rankHospitalsForCase(
                "emg-c2-cap", 1, false, List.of("TRAUMA_CENTER"));
        assertTrue(ranks.stream().noneMatch(r -> "hosp-c2-notrauma".equals(r.getHospitalId())));
        assertTrue(ranks.stream().anyMatch(r -> "hosp-c2-trauma".equals(r.getHospitalId())));
    }

    @Test
    void estimate_containsAssumptionsAndMaxPlusHandover() {
        seedHospital("hosp-c2-est", 4, 0, true, true, Instant.now());
        seedCase("emg-c2-est");
        List<HospitalRankDto> ranks = hospitalService.rankHospitalsForCase("emg-c2-est", 1, false);
        assertFalse(ranks.isEmpty());
        HospitalRankDto top = ranks.get(0);
        assertNotNull(top.getAssumptions());
        assertTrue(top.getAssumptions().stream().anyMatch(a -> a.startsWith("formula=")));
        double expected = Math.max(top.getTravelEtaMins(), top.getResourceReadyDelayMins()) + top.getHandoverDelayMins();
        assertEquals(Math.round(expected * 10.0) / 10.0, top.getTotalTransparentEstimateMins());
        assertTrue(top.getAssumptions().stream().anyMatch(a -> a.contains("no_guaranteed")));
    }

    @Test
    void roadblockWithNoAlternative_operatorAlertNoRoute() {
        Roadblock rb = new Roadblock();
        rb.setRoadblockId("rb-c2-block");
        rb.setSource("TRAFFIC_POLICE");
        rb.setLatitude(12.9716);
        rb.setLongitude(77.5946);
        rb.setRadiusMeters(500.0);
        rb.setVerified(true);
        rb.setExpiresAt(Instant.now().plus(1, ChronoUnit.HOURS));
        roadblocks.save(rb);

        Map<String, Object> route = routingService.calculateRoute(
                "msn-c2-1", "AMBULANCE_TO_PATIENT",
                12.9716, 77.5946, 12.9720, 77.5950);
        assertEquals(false, route.get("routeAvailable"));
        assertNotNull(route.get("operatorAlert"));
        assertFalse(audits.findByAggregateIdAndEventType("msn-c2-1", "ROUTING_NO_ALTERNATIVE").isEmpty());
        assertFalse(route.containsKey("distanceKm"));
    }

    @Test
    void expiredRoadblock_noLongerAffectsRouting() {
        jdbc.update("DELETE FROM roadblocks WHERE roadblock_id LIKE 'rb-c2-%'");
        Roadblock rb = new Roadblock();
        rb.setRoadblockId("rb-c2-exp");
        rb.setSource("TEMP");
        rb.setLatitude(12.9716);
        rb.setLongitude(77.5946);
        rb.setRadiusMeters(500.0);
        rb.setVerified(true);
        rb.setExpiresAt(Instant.now().minus(10, ChronoUnit.MINUTES));
        roadblocks.save(rb);

        // Same corridor as the active-block test; expired block must not block. No missionId
        // so RouteVersion FK is not exercised here.
        Map<String, Object> route = routingService.calculateRoute(
                12.9716, 77.5946, 12.9720, 77.5950);
        assertEquals(Boolean.TRUE, route.get("routeAvailable"), String.valueOf(route));
        assertEquals(Boolean.TRUE, route.get("simulated"));
    }

    private void seedCase(String id) {
        if (cases.existsById(id)) {
            return;
        }
        EmergencyCase c = new EmergencyCase();
        c.setEmergencyId(id);
        c.setCallbackNumber("9000000000");
        c.setCurrentState("ASSIGNED");
        cases.save(c);
        IncidentLocation loc = new IncidentLocation();
        loc.setLocationId("loc-" + id);
        loc.setEmergencyId(id);
        loc.setCallerLat(12.9716);
        loc.setCallerLng(77.5946);
        loc.setConfirmedLat(12.9716);
        loc.setConfirmedLng(77.5946);
        locations.save(loc);
    }

    private void seedHospital(String id, int beds, int reserved, boolean trauma, boolean cath, Instant updatedAt) {
        Hospital h = new Hospital();
        h.setHospitalId(id);
        h.setName(id);
        h.setLatitude(12.9750);
        h.setLongitude(77.5980);
        h.setAvailableBeds(beds);
        h.setReservedBeds(reserved);
        h.setAvailableIcu(2);
        h.setHasTraumaCenter(trauma);
        h.setHasCardiacCathLab(cath);
        h.setEmergencyWorkload("NORMAL");
        h.setResourceUpdatedAt(updatedAt);
        hospitals.save(h);
    }
}
