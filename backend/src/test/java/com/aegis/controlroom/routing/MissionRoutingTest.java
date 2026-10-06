package com.aegis.controlroom.routing;

import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.model.IncidentLocation;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.repository.AmbulanceRepository;
import com.aegis.controlroom.repository.IncidentLocationRepository;
import com.aegis.controlroom.repository.EmergencyCaseRepository;
import com.aegis.controlroom.repository.MissionRepository;
import com.aegis.controlroom.repository.RouteVersionRepository;
import com.aegis.controlroom.service.MissionRoutingService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class MissionRoutingTest {
    @Autowired MissionRoutingService missionRoutingService;
    @Autowired AmbulanceRepository ambulances;
    @Autowired IncidentLocationRepository locations;
    @Autowired EmergencyCaseRepository cases;
    @Autowired MissionRepository missions;
    @Autowired RouteVersionRepository routeVersions;
    @Autowired JdbcTemplate jdbc;

    private Ambulance ambulance;
    private Double originalLat;
    private Double originalLng;
    private Instant originalPing;

    @BeforeEach
    void prepare() {
        jdbc.update("DELETE FROM roadblocks");
        jdbc.update("DELETE FROM route_versions WHERE mission_id = 'msn-route-refresh'");
        jdbc.update("DELETE FROM missions WHERE mission_id = 'msn-route-refresh'");
        jdbc.update("DELETE FROM incident_locations WHERE emergency_id = 'emg-route-refresh'");
        jdbc.update("DELETE FROM emergency_cases WHERE emergency_id = 'emg-route-refresh'");
        ambulance = ambulances.findById("AMB-108-NORTH-01").orElseThrow();
        originalLat = ambulance.getLatitude();
        originalLng = ambulance.getLongitude();
        originalPing = ambulance.getTelemetryUpdatedAt();
        ambulance.setLatitude(12.9900);
        ambulance.setLongitude(77.5900);
        ambulance.setTelemetryUpdatedAt(Instant.now());
        ambulances.save(ambulance);

        EmergencyCase emergencyCase = new EmergencyCase();
        emergencyCase.setEmergencyId("emg-route-refresh");
        emergencyCase.setCallbackNumber("9000111222");
        emergencyCase.setCurrentState("EN_ROUTE_TO_PATIENT");
        cases.save(emergencyCase);

        IncidentLocation location = new IncidentLocation();
        location.setLocationId("loc-route-refresh");
        location.setEmergencyId("emg-route-refresh");
        location.setConfirmedLat(12.9716);
        location.setConfirmedLng(77.5946);
        location.setLocationSource("TEST_CONFIRMED");
        locations.save(location);

        Mission mission = new Mission();
        mission.setMissionId("msn-route-refresh");
        mission.setEmergencyId("emg-route-refresh");
        mission.setAmbulanceId(ambulance.getAmbulanceId());
        mission.setDriverId("usr-drv-01");
        mission.setCurrentState("EN_ROUTE_TO_PATIENT");
        missions.save(mission);
    }

    @AfterEach
    void clean() {
        routeVersions.deleteAll(routeVersions.findByMissionIdOrderByVersionNumberDesc("msn-route-refresh"));
        missions.deleteById("msn-route-refresh");
        locations.delete(locations.findByEmergencyId("emg-route-refresh").orElseThrow());
        cases.deleteById("emg-route-refresh");
        ambulances.findById("AMB-108-NORTH-01").ifPresent(current -> {
            current.setLatitude(originalLat);
            current.setLongitude(originalLng);
            current.setTelemetryUpdatedAt(originalPing);
            ambulances.save(current);
        });
    }

    @Test
    void routeEtaAndVersionRefreshWhenAmbulanceLocationMoves() {
        Map<String, Object> before = missionRoutingService.currentRoute("msn-route-refresh");
        assertEquals(Boolean.TRUE, before.get("routeAvailable"));
        assertEquals(Boolean.TRUE, before.get("simulated"));
        double beforeEta = ((Number) before.get("estimatedDurationMins")).doubleValue();

        Ambulance moved = ambulances.findById("AMB-108-NORTH-01").orElseThrow();
        moved.setLatitude(12.9730);
        moved.setLongitude(77.5940);
        moved.setTelemetryUpdatedAt(Instant.now());
        ambulances.save(moved);

        Map<String, Object> after = missionRoutingService.currentRoute("msn-route-refresh");
        double afterEta = ((Number) after.get("estimatedDurationMins")).doubleValue();
        assertTrue(afterEta < beforeEta, "a closer ambulance location should reduce the refreshed ETA");
        assertTrue(((java.util.List<?>) after.get("points")).size() >= 2);
        assertTrue(((Number) after.get("routeVersion")).intValue() > 1);
    }
}
