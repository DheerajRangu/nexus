package com.aegis.controlroom.demo;

import com.aegis.controlroom.service.DemoResetService;
import com.aegis.controlroom.service.DemoScenarioService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"test", "demo"})
@TestPropertySource(properties = {"aegis.demo.step-delay-ms=0", "aegis.dispatch.auto-enabled=true"})
class DemoD1Test {

    @Autowired DemoResetService resetService;
    @Autowired DemoScenarioService scenarioService;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestRestTemplate http;
    @Autowired com.aegis.controlroom.service.IntakeService intakeService;
    @Autowired com.aegis.controlroom.repository.DispatchOfferRepository offers;
    @Autowired com.aegis.controlroom.repository.EmergencyCaseRepository cases;

    @BeforeEach
    void prep() {
        jdbc.update("UPDATE ambulances SET is_available = TRUE, status = 'IDLE', telemetry_updated_at = NOW() WHERE ambulance_id LIKE 'AMB-108-%'");
        jdbc.update("UPDATE hospitals SET reserved_beds = 0, resource_updated_at = NOW()");
        jdbc.update("UPDATE hospitals SET available_beds = 14, available_icu = 3 WHERE hospital_id = 'HOSP-CITY-GENERAL-01'");
        jdbc.update("UPDATE hospitals SET available_beds = 8, available_icu = 1 WHERE hospital_id = 'HOSP-ST-JUDE-02'");
        jdbc.update("UPDATE hospitals SET available_beds = 2, available_icu = 0 WHERE hospital_id = 'HOSP-METRO-CARE-03'");
        jdbc.update("UPDATE driver_shifts SET is_active = TRUE WHERE shift_id IN ('shf-01','shf-02')");
        resetService.resetAllOperationalData();
    }

    @Test
    void resetTwice_givesIdenticalState() {
        Map<String, Object> a = resetService.resetAllOperationalData();
        Map<String, Object> b = resetService.resetAllOperationalData();
        assertEquals(a, b);
        assertEquals(0L, a.get("cases"));
        assertEquals(0L, a.get("missions"));
        assertEquals(0L, a.get("reservations"));
    }

    @Test
    void demoOperatorCanSignInAndReceivesJwt() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(
                Map.of("username", "operator1", "password", "password"), headers);

        var response = http.postForEntity("/api/v1/auth/login", request, Map.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("operator1", response.getBody().get("username"));
        assertEquals("ROLE_OPERATOR", response.getBody().get("role"));
        assertNotNull(response.getBody().get("token"));
    }

    @Test
    void confirmedLocationAutomaticallyOffersTopEligibleAmbulance() {
        com.aegis.controlroom.dto.ManualIntakeRequestDto intake = new com.aegis.controlroom.dto.ManualIntakeRequestDto();
        intake.setCallbackNumber("9000111222");
        intake.setChiefComplaint("TRAUMA");
        intake.setPriority("P2_URGENT");
        intake.setNotes("Training case with confirmed coordinates");
        intake.setLatitude(12.9716);
        intake.setLongitude(77.5946);
        intake.setAddressLandmark("Training location");

        var created = intakeService.processManualIntake(intake);

        assertEquals("DISPATCHING", cases.findById(created.getEmergencyId()).orElseThrow().getCurrentState());
        var openOffers = offers.findByEmergencyIdAndStatus(created.getEmergencyId(), "OFFERED");
        assertEquals(1, openOffers.size());
        assertEquals("AMB-108-NORTH-01", openOffers.get(0).getAmbulanceId());
    }

    @Test
    void runScenario_reachesCompletedWithReservationConsumed() {
        Map<String, Object> result = scenarioService.runScenario();
        assertEquals("COMPLETED", result.get("missionState"));
        assertEquals("CONSUMED", result.get("reservationStatus"));
        assertNotNull(result.get("missionId"));
        assertNotNull(result.get("emergencyId"));
    }

    @Test
    void inject_driverRejection_acceptsNextAmbulance() {
        scenarioService.inject("driverRejection");
        Map<String, Object> result = scenarioService.runScenario();
        assertEquals("DRIVER_REJECTION", result.get("injection"));
        assertEquals("COMPLETED", result.get("missionState"));
        assertNotNull(result.get("acceptedAmbulanceId"));
    }

    @Test
    void inject_fullHospital_usesNextHospital() {
        scenarioService.inject("fullHospital");
        Map<String, Object> result = scenarioService.runScenario();
        assertEquals("FULL_HOSPITAL", result.get("injection"));
        assertEquals("COMPLETED", result.get("missionState"));
        assertNotNull(result.get("skippedFullHospital"));
        assertNotNull(result.get("nextHospitalId"));
        assertNotEquals(result.get("skippedFullHospital"), result.get("nextHospitalId"));
    }

    @Test
    void inject_competingAssignments_exactlyOneWinner() {
        scenarioService.inject("competingAssignments");
        Map<String, Object> result = scenarioService.runScenario();
        assertEquals("COMPETING_ASSIGNMENTS", result.get("injection"));
        assertEquals(1, result.get("competingWinners"));
        assertEquals("COMPLETED", result.get("missionState"));
    }

    @Test
    void inject_aiDown_returnsFallback() {
        scenarioService.inject("aiDown");
        Map<String, Object> result = scenarioService.runScenario();
        assertEquals("AI_DOWN", result.get("injection"));
        assertEquals("FALLBACK", result.get("aiStatus"));
        assertEquals("COMPLETED", result.get("missionState"));
    }
}
