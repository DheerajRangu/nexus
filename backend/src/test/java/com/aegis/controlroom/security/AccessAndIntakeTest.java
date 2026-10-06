package com.aegis.controlroom.security;

import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.model.Role;
import com.aegis.controlroom.model.TrackingSession;
import com.aegis.controlroom.model.User;
import com.aegis.controlroom.repository.AmbulanceRepository;
import com.aegis.controlroom.repository.EmergencyCaseRepository;
import com.aegis.controlroom.repository.MissionRepository;
import com.aegis.controlroom.repository.TrackingSessionRepository;
import com.aegis.controlroom.repository.UserRepository;
import com.aegis.controlroom.service.CitizenTrackingService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccessAndIntakeTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EmergencyCaseRepository cases;
    @Autowired UserRepository users;
    @Autowired MissionRepository missions;
    @Autowired AmbulanceRepository ambulances;
    @Autowired TrackingSessionRepository sessions;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;

    @Test
    void badSignature_returns401() throws Exception {
        long before = cases.count();
        mvc.perform(post("/api/v1/intake/webhook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Aegis-Timestamp", String.valueOf(Instant.now().getEpochSecond()))
                        .header("X-Aegis-Signature", "sha256=deadbeef")
                        .header("X-Idempotency-Key", "bad-sig-1")
                        .content("{\"callbackNumber\":\"9000000099\",\"externalCallRef\":\"ref-bad\"}"))
                .andExpect(status().isUnauthorized());
        assertEquals(before, cases.count());
    }

    @Test
    void duplicateWebhook_createsOneCase() throws Exception {
        String body = "{\"callbackNumber\":\"9000000098\",\"externalCallRef\":\"ref-dup-1\",\"rawNotes\":\"chest pain\"}";
        String ts = String.valueOf(Instant.now().getEpochSecond());
        String sig = "sha256=" + WebhookSignature.hmacHex("test-webhook-secret", ts + "." + body);
        MvcResult first = mvc.perform(signed(body, ts, sig, "dup-key-1")).andExpect(status().isAccepted()).andReturn();
        MvcResult second = mvc.perform(signed(body, ts, sig, "dup-key-1")).andExpect(status().isAccepted()).andReturn();
        JsonNode a = json.readTree(first.getResponse().getContentAsString());
        JsonNode b = json.readTree(second.getResponse().getContentAsString());
        assertEquals(a.get("emergencyId").asText(), b.get("emergencyId").asText());
    }

    @Test
    void expiredToken_returns410() throws Exception {
        ensureCase("emg-exp-1");
        if (!sessions.existsById("sess-expired-1")) {
            TrackingSession session = new TrackingSession();
            session.setSessionId("sess-expired-1");
            session.setEmergencyId("emg-exp-1");
            session.setTrackingToken(CitizenTrackingService.sha256("tk_expiredtokenvalue"));
            session.setExpiresAt(Instant.now().minus(1, ChronoUnit.HOURS));
            sessions.save(session);
        }
        mvc.perform(get("/api/v1/tracking/tk_expiredtokenvalue")).andExpect(status().isGone());
    }

    @Test
    void driverReadingAnotherDriversMission_returns403() throws Exception {
        saveUser("usr-drv-a", "driver-a", Role.ROLE_DRIVER, "amb-scope-1");
        saveUser("usr-drv-b", "driver-b", Role.ROLE_DRIVER, "amb-scope-2");
        ensureAmbulance("amb-scope-1");
        ensureCase("emg-scope-1");
        if (!missions.existsById("m-scope-1")) {
            Mission mission = new Mission();
            mission.setMissionId("m-scope-1");
            mission.setEmergencyId("emg-scope-1");
            mission.setAmbulanceId("amb-scope-1");
            mission.setDriverId("usr-drv-a");
            mission.setCurrentState("ASSIGNED");
            missions.save(mission);
        }
        String token = jwt.issue("usr-drv-b", "ROLE_DRIVER", "amb-scope-2");
        mvc.perform(get("/api/v1/dispatch/missions/m-scope-1").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void hospitalUserReadingAnotherHospital_returns403() throws Exception {
        saveUser("usr-hosp-b", "hosp-b", Role.ROLE_HOSPITAL_STAFF, "HOSP-ST-JUDE-02");
        String token = jwt.issue("usr-hosp-b", "ROLE_HOSPITAL_STAFF", "HOSP-ST-JUDE-02");
        mvc.perform(get("/api/v1/hospitals/scope/HOSP-CITY-GENERAL-01").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void logRedaction_hidesPhoneAndToken() {
        String line = RedactingRequestLogFilter.format("GET", "/api/v1/tracking/tk_abc123token", "phone=+919876543210");
        assertFalse(line.contains("9876543210"));
        assertFalse(line.contains("tk_abc123token"));
    }

    private org.springframework.test.web.servlet.RequestBuilder signed(String body, String ts, String sig, String key) {
        return post("/api/v1/intake/webhook")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Aegis-Timestamp", ts)
                .header("X-Aegis-Signature", sig)
                .header("X-Idempotency-Key", key)
                .content(body);
    }

    private void saveUser(String id, String username, Role role, String scope) {
        if (users.existsById(id)) {
            return;
        }
        users.save(new User(id, username, encoder.encode("secret"), username, role, scope));
    }

    private void ensureCase(String id) {
        if (cases.existsById(id)) {
            return;
        }
        var c = new com.aegis.controlroom.model.EmergencyCase();
        c.setEmergencyId(id);
        c.setCallbackNumber("9000000000");
        c.setCurrentState("INTAKE_CREATED");
        cases.save(c);
    }

    private void ensureAmbulance(String id) {
        if (ambulances.existsById(id)) {
            return;
        }
        Ambulance ambulance = new Ambulance();
        ambulance.setAmbulanceId(id);
        ambulance.setLicensePlate(id);
        ambulance.setCapabilityTier("BLS");
        ambulance.setLatitude(12.97);
        ambulance.setLongitude(77.59);
        ambulances.save(ambulance);
    }
}
