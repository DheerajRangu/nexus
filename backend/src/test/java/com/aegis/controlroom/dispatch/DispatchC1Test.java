package com.aegis.controlroom.dispatch;

import com.aegis.controlroom.api.DomainConflictException;
import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import com.aegis.controlroom.service.DispatchEngineService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class DispatchC1Test {

    @Autowired DispatchEngineService dispatch;
    @Autowired EmergencyCaseRepository cases;
    @Autowired IncidentLocationRepository locations;
    @Autowired AmbulanceRepository ambulances;
    @Autowired DriverShiftRepository shifts;
    @Autowired UserRepository users;
    @Autowired DispatchOfferRepository offers;
    @Autowired MissionRepository missions;
    @Autowired AuditEventRepository audits;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void cleanDispatchFixtures() {
        jdbc.update("UPDATE users SET role = 'ROLE_DRIVER' WHERE role = 'DRIVER'");
        // Isolate shortlist from seed fleet + leftover step fixtures.
        jdbc.update("DELETE FROM ambulances WHERE ambulance_id LIKE 'amb-c3-%'");
        jdbc.update("DELETE FROM driver_shifts WHERE shift_id LIKE 'sh-c3-%'");
        jdbc.update("UPDATE ambulances SET is_available = FALSE WHERE ambulance_id LIKE 'AMB-108-%'");
        jdbc.update("DELETE FROM outbox_events WHERE aggregate_id LIKE 'emg-c1-%'");
        jdbc.update("DELETE FROM dispatch_offers WHERE emergency_id LIKE 'emg-c1-%'");
        jdbc.update("DELETE FROM missions WHERE emergency_id LIKE 'emg-c1-%'");
        jdbc.update("DELETE FROM incident_locations WHERE emergency_id LIKE 'emg-c1-%'");
        jdbc.update("DELETE FROM emergency_cases WHERE emergency_id LIKE 'emg-c1-%'");
        jdbc.update("DELETE FROM driver_shifts WHERE shift_id LIKE 'sh-c1-%'");
        jdbc.update("DELETE FROM ambulances WHERE ambulance_id LIKE 'amb-c1-%'");
        jdbc.update("DELETE FROM audit_events WHERE aggregate_id LIKE 'emg-c1-%'");
        jdbc.update("DELETE FROM users WHERE user_id LIKE 'usr-c1-%'");
        jdbc.update("DELETE FROM roadblocks");
    }

    @AfterEach
    void restoreSeedFleet() {
        jdbc.update("UPDATE ambulances SET is_available = TRUE, status = 'IDLE' WHERE ambulance_id LIKE 'AMB-108-%' AND assigned_driver_id IS NOT NULL");
        jdbc.update("UPDATE ambulances SET is_available = TRUE, status = 'IDLE' WHERE ambulance_id = 'AMB-108-SOUTH-03'");
    }

    @Test
    void acceptOffer_whenParallel_createsExactlyOneAssignment() throws Exception {
        seedCase("emg-c1-race", "P2_URGENT");
        seedUnit("amb-c1-race", "usr-c1-drv-race", Instant.now(), "ALS");
        DispatchOffer offer = dispatch.createDispatchOffer("emg-c1-race", "amb-c1-race");

        int n = 20;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger wins = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        for (int i = 0; i < n; i++) {
            pool.submit(() -> {
                ready.countDown();
                try {
                    start.await(5, TimeUnit.SECONDS);
                    dispatch.respondToOffer(offer.getOfferId(), "ACCEPT");
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

        assertEquals(1, offers.countByEmergencyIdAndStatus("emg-c1-race", "ACCEPTED"));
        assertEquals(1, missions.countByEmergencyIdAndCurrentState("emg-c1-race", "ASSIGNED"));
        assertEquals(1, wins.get());
        assertEquals(19, conflicts.get());
    }

    @Test
    void expiredOffer_jobOffersNextAndIsIdempotent() {
        seedCase("emg-c1-exp", "P2_URGENT");
        seedUnit("amb-c1-exp-a", "usr-c1-drv-a", Instant.now(), "ALS");
        seedUnit("amb-c1-exp-b", "usr-c1-drv-b", Instant.now(), "ALS");

        DispatchOffer first = dispatch.createDispatchOffer("emg-c1-exp", "amb-c1-exp-a");
        first.setExpiresAt(Instant.now().minusSeconds(5));
        offers.save(first);

        dispatch.checkExpiredOffers();
        DispatchOffer expired = offers.findById(first.getOfferId()).orElseThrow();
        assertEquals("EXPIRED", expired.getStatus());
        List<DispatchOffer> open = offers.findByEmergencyIdAndStatus("emg-c1-exp", "OFFERED");
        assertEquals(1, open.size());
        assertEquals("amb-c1-exp-b", open.get(0).getAmbulanceId());

        long openBefore = offers.countByEmergencyIdAndStatus("emg-c1-exp", "OFFERED");
        long expiredBefore = offers.countByEmergencyIdAndStatus("emg-c1-exp", "EXPIRED");
        dispatch.checkExpiredOffers();
        assertEquals(openBefore, offers.countByEmergencyIdAndStatus("emg-c1-exp", "OFFERED"));
        assertEquals(expiredBefore, offers.countByEmergencyIdAndStatus("emg-c1-exp", "EXPIRED"));
    }

    @Test
    void noEligibleAmbulance_createsEscalationAlert() {
        seedCase("emg-c1-esc", "P1_CRITICAL");
        // BLS only — filtered for P1
        seedUnit("amb-c1-esc-bls", "usr-c1-esc", Instant.now(), "BLS");
        assertTrue(dispatch.shortlistAndRankAmbulances("emg-c1-esc").isEmpty());
        dispatch.offerNextOrEscalate("emg-c1-esc", null);
        EmergencyCase c = cases.findById("emg-c1-esc").orElseThrow();
        assertEquals("ESCALATED", c.getCurrentState());
        assertFalse(audits.findByAggregateIdAndEventType("emg-c1-esc", "ESCALATION").isEmpty());
    }

    @Test
    void stalePingAndWrongCapability_areFilteredOut() {
        seedCase("emg-c1-filt", "P1_CRITICAL");
        seedUnit("amb-c1-fresh-als", "usr-c1-ok", Instant.now(), "ALS");
        seedUnit("amb-c1-stale", "usr-c1-stale", Instant.now().minus(10, ChronoUnit.MINUTES), "ALS");
        seedUnit("amb-c1-bls", "usr-c1-bls", Instant.now(), "BLS");

        List<AmbulanceRankDto> ranks = dispatch.shortlistAndRankAmbulances("emg-c1-filt");
        Set<String> ids = ranks.stream().map(AmbulanceRankDto::getAmbulanceId).collect(Collectors.toSet());
        assertTrue(ids.contains("amb-c1-fresh-als"));
        assertFalse(ids.contains("amb-c1-stale"));
        assertFalse(ids.contains("amb-c1-bls"));
        assertTrue(ranks.get(0).isSimulated());
        assertTrue(ranks.get(0).getReasons().stream().anyMatch(r -> r.contains("SIMULATED")));
    }

    private void seedCase(String id, String triage) {
        EmergencyCase c = new EmergencyCase();
        c.setEmergencyId(id);
        c.setCallbackNumber("9000000000");
        c.setTriagePriority(triage);
        c.setCurrentState("CREATED");
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

    private void seedUnit(String ambId, String driverId, Instant pingAt, String tier) {
        if (!users.existsById(driverId)) {
            users.save(new User(driverId, driverId, "hash", driverId, Role.ROLE_DRIVER, ambId));
        }
        Ambulance amb = new Ambulance();
        amb.setAmbulanceId(ambId);
        amb.setLicensePlate(ambId);
        amb.setCapabilityTier(tier);
        amb.setLatitude(12.9720);
        amb.setLongitude(77.5950);
        amb.setTelemetryUpdatedAt(pingAt);
        amb.setIsAvailable(true);
        amb.setStatus("IDLE");
        amb.setAssignedDriverId(driverId);
        ambulances.save(amb);
        DriverShift shift = new DriverShift();
        shift.setShiftId("sh-c1-" + ambId);
        shift.setAmbulanceId(ambId);
        shift.setDriverId(driverId);
        shift.setStartTime(Instant.now().minus(1, ChronoUnit.HOURS));
        shift.setIsActive(true);
        shifts.save(shift);
    }
}
