package com.aegis.controlroom.security;

import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import com.aegis.controlroom.service.CitizenTrackingService;
import com.aegis.controlroom.service.DispatchEngineService;

import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class HttpContractE0Test {

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @Autowired DispatchEngineService dispatch;
    @Autowired EmergencyCaseRepository cases;
    @Autowired IncidentLocationRepository locations;
    @Autowired AmbulanceRepository ambulances;
    @Autowired DriverShiftRepository shifts;
    @Autowired UserRepository users;
    @Autowired TrackingSessionRepository sessions;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM dispatch_offers WHERE emergency_id LIKE 'emg-e0-%'");
        jdbc.update("DELETE FROM missions WHERE emergency_id LIKE 'emg-e0-%'");
        jdbc.update("DELETE FROM incident_locations WHERE emergency_id LIKE 'emg-e0-%'");
        jdbc.update("DELETE FROM tracking_sessions WHERE emergency_id LIKE 'emg-e0-%' OR session_id LIKE 'sess-e0-%'");
        jdbc.update("DELETE FROM emergency_cases WHERE emergency_id LIKE 'emg-e0-%'");
        jdbc.update("DELETE FROM driver_shifts WHERE shift_id LIKE 'sh-e0-%'");
        jdbc.update("DELETE FROM ambulances WHERE ambulance_id LIKE 'amb-e0-%'");
        jdbc.update("DELETE FROM users WHERE user_id LIKE 'usr-e0-%'");
    }

    @Test
    void lostDispatchRace_returns409ProblemJson() throws Exception {
        seedCase("emg-e0-race");
        seedUnit("amb-e0-race", "usr-e0-drv");
        DispatchOffer offer = dispatch.createDispatchOffer("emg-e0-race", "amb-e0-race");
        String token = jwt.issue("usr-e0-drv", "ROLE_DRIVER", "amb-e0-race");

        mvc.perform(post("/api/v1/dispatch/offer/" + offer.getOfferId() + "/respond")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"ACCEPT\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/dispatch/offer/" + offer.getOfferId() + "/respond")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"ACCEPT\"}"))
                .andExpect(status().isConflict())
                .andExpect(header().string("Content-Type", containsString("application/problem+json")))
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void badWebhookSignature_returns401() throws Exception {
        mvc.perform(post("/api/v1/intake/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Aegis-Timestamp", String.valueOf(Instant.now().getEpochSecond()))
                        .header("X-Aegis-Signature", "sha256=deadbeef")
                        .header("X-Idempotency-Key", "e0-bad-sig")
                        .content("{\"callbackNumber\":\"9000000099\",\"externalCallRef\":\"ref-e0-bad\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expiredTrackingToken_returns410() throws Exception {
        seedCase("emg-e0-track");
        TrackingSession session = new TrackingSession();
        session.setSessionId("sess-e0-exp");
        session.setEmergencyId("emg-e0-track");
        session.setTrackingToken(CitizenTrackingService.sha256("tk_e0_expired_token_value"));
        session.setExpiresAt(Instant.now().minus(1, ChronoUnit.HOURS));
        sessions.save(session);

        mvc.perform(get("/api/v1/tracking/tk_e0_expired_token_value"))
                .andExpect(status().isGone());
    }

    @Test
    void health_isUp() throws Exception {
        MvcResult r = mvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andReturn();
        assertTrue(r.getResponse().getContentAsString().contains("flywayInstalledRank"));
    }

    private void seedCase(String id) {
        EmergencyCase c = new EmergencyCase();
        c.setEmergencyId(id);
        c.setCallbackNumber("9000000000");
        c.setTriagePriority("P2_URGENT");
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

    private void seedUnit(String ambId, String driverId) {
        if (!users.existsById(driverId)) {
            users.save(new User(driverId, driverId, "hash", driverId, Role.ROLE_DRIVER, ambId));
        }
        Ambulance amb = new Ambulance();
        amb.setAmbulanceId(ambId);
        amb.setLicensePlate(ambId);
        amb.setCapabilityTier("ALS");
        amb.setLatitude(12.9720);
        amb.setLongitude(77.5950);
        amb.setTelemetryUpdatedAt(Instant.now());
        amb.setIsAvailable(true);
        amb.setStatus("IDLE");
        amb.setAssignedDriverId(driverId);
        ambulances.save(amb);
        DriverShift shift = new DriverShift();
        shift.setShiftId("sh-e0-" + ambId);
        shift.setAmbulanceId(ambId);
        shift.setDriverId(driverId);
        shift.setStartTime(Instant.now().minus(1, ChronoUnit.HOURS));
        shift.setIsActive(true);
        shifts.save(shift);
    }
}
