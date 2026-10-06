package com.aegis.controlroom.ai;

import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import com.aegis.controlroom.service.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class AiEventsC3Test {

    @Autowired AIServiceClient ai;
    @Autowired DispatchEngineService dispatch;
    @Autowired OutboxService outboxService;
    @Autowired OutboxPublisherJob publisherJob;
    @Autowired OutboxEventRepository outboxEvents;
    @Autowired EventVersionGate eventGate;
    @Autowired SnapshotService snapshotService;
    @Autowired EmergencyCaseRepository cases;
    @Autowired IncidentLocationRepository locations;
    @Autowired AmbulanceRepository ambulances;
    @Autowired DriverShiftRepository shifts;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        eventGate.clear();
        jdbc.update("DELETE FROM outbox_events WHERE aggregate_id LIKE 'emg-c3-%' OR aggregate_id LIKE 'msn-c3-%' OR aggregate_id LIKE 'amb-c3-%'");
        jdbc.update("DELETE FROM dispatch_offers WHERE emergency_id LIKE 'emg-c3-%'");
        jdbc.update("DELETE FROM missions WHERE emergency_id LIKE 'emg-c3-%'");
        jdbc.update("DELETE FROM incident_locations WHERE emergency_id LIKE 'emg-c3-%'");
        jdbc.update("DELETE FROM emergency_cases WHERE emergency_id LIKE 'emg-c3-%'");
        jdbc.update("DELETE FROM driver_shifts WHERE shift_id LIKE 'sh-c3-%'");
        jdbc.update("DELETE FROM ambulances WHERE ambulance_id LIKE 'amb-c3-%'");
        jdbc.update("DELETE FROM users WHERE user_id LIKE 'usr-c3-%'");
    }

    @Test
    void deadAiPort_returnsFallback_andDispatchStillWorks() {
        Map<String, Object> nlp = ai.parseNotesNLP("Caller reports chest pain");
        assertEquals("FALLBACK", nlp.get("aiStatus"));
        assertEquals("CARDIAC_ARREST", nlp.get("chiefComplaint"));
        assertEquals("NONE", nlp.get("actionTaken"));

        seedCase("emg-c3-ai", "P1_CRITICAL");
        seedUnit("amb-c3-ai", "usr-c3-drv", Instant.now(), "ALS");
        List<AmbulanceRankDto> ranks = dispatch.shortlistAndRankAmbulances("emg-c3-ai");
        assertFalse(ranks.isEmpty(), "dispatch shortlist must work while AI is down");
    }

    @Test
    void outboxWrittenAndPublished_afterStateChange() {
        seedCase("emg-c3-out", "P2_URGENT");
        seedUnit("amb-c3-out", "usr-c3-drv-out", Instant.now(), "ALS");
        DispatchOffer offer = dispatch.createDispatchOffer("emg-c3-out", "amb-c3-out");
        Mission mission = dispatch.respondToOffer(offer.getOfferId(), "ACCEPT");
        assertNotNull(mission);

        List<OutboxEvent> rows = outboxEvents.findByAggregateIdOrderByEntityVersionAsc(mission.getMissionId());
        assertFalse(rows.isEmpty(), "outbox row must exist after mission.assigned");
        assertTrue(rows.stream().anyMatch(r -> "mission.assigned".equals(r.getType())));
        assertTrue(rows.stream().anyMatch(r -> !r.isPublished()));

        publisherJob.publishPending();
        OutboxEvent published = outboxEvents.findById(rows.get(0).getEventId()).orElseThrow();
        assertTrue(published.isPublished());
        assertNotNull(published.getPublishedAt());
    }

    @Test
    void duplicateAndOlderEntityVersion_eventsAreDropped() {
        assertTrue(eventGate.accept("msn-c3-v", 2));
        assertFalse(eventGate.accept("msn-c3-v", 2), "duplicate entityVersion dropped");
        assertFalse(eventGate.accept("msn-c3-v", 1), "older entityVersion dropped");
        assertTrue(eventGate.accept("msn-c3-v", 3), "newer entityVersion accepted");
    }

    @Test
    void snapshot_returnsRenderableReconnectState() {
        seedCase("emg-c3-snap", "P2_URGENT");
        Map<String, Object> snap = snapshotService.fullSnapshot();
        assertNotNull(snap.get("generatedAt"));
        assertTrue(snap.containsKey("cases"));
        assertTrue(snap.containsKey("missions"));
        assertTrue(snap.containsKey("ambulances"));
        assertTrue(snap.containsKey("hospitals"));
        assertTrue(snap.containsKey("offers"));
        @SuppressWarnings("unchecked")
        List<?> caseList = (List<?>) snap.get("cases");
        assertTrue(caseList.stream().anyMatch(c -> {
            if (c instanceof EmergencyCase ec) {
                return "emg-c3-snap".equals(ec.getEmergencyId());
            }
            return false;
        }));
    }

    private void seedCase(String id, String priority) {
        if (cases.existsById(id)) {
            return;
        }
        EmergencyCase c = new EmergencyCase();
        c.setEmergencyId(id);
        c.setCallbackNumber("9000000000");
        c.setTriagePriority(priority);
        c.setChiefComplaint("TRAUMA");
        c.setCurrentState("LOCATION_CONFIRMED");
        c.setLocationConfirmed(true);
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
        shift.setShiftId("sh-c3-" + ambId);
        shift.setAmbulanceId(ambId);
        shift.setDriverId(driverId);
        shift.setStartTime(pingAt.minusSeconds(3600));
        shift.setIsActive(true);
        shifts.save(shift);
    }
}
