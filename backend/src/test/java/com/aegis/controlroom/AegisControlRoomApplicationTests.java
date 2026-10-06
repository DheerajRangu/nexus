package com.aegis.controlroom;

import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.dto.HospitalRankDto;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.repository.EmergencyCaseRepository;
import com.aegis.controlroom.repository.HospitalRepository;
import com.aegis.controlroom.service.DispatchEngineService;
import com.aegis.controlroom.service.HospitalDecisionEngineService;
import com.aegis.controlroom.service.MissionStateMachineService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class AegisControlRoomApplicationTests {

	@Autowired
	private DispatchEngineService dispatchEngineService;

	@Autowired
	private HospitalDecisionEngineService hospitalDecisionEngineService;

	@Autowired
	private MissionStateMachineService missionStateMachineService;

	@Autowired
	private EmergencyCaseRepository emergencyCaseRepository;

	@Autowired
	private com.aegis.controlroom.repository.IncidentLocationRepository incidentLocationRepository;

	@Autowired
	private HospitalRepository hospitalRepository;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void contextLoads() {
		assertNotNull(dispatchEngineService);
	}

	@Test
	void testHospitalTransparentPlanningEstimate() {
		// Seed hospitals may have stale resource_updated_at from Flyway time; refresh for this assertion.
		jdbc.update("UPDATE hospitals SET resource_updated_at = NOW()");
		// V2 seed has hospitals but no emergency row, so the old emg-seed-01 id cannot exist.
		if (emergencyCaseRepository.findById("emg-estimate-01").isEmpty()) {
			com.aegis.controlroom.model.EmergencyCase c = new com.aegis.controlroom.model.EmergencyCase();
			c.setEmergencyId("emg-estimate-01");
			c.setCallbackNumber("9000001111");
			c.setCurrentState("INTAKE_CREATED");
			emergencyCaseRepository.save(c);
			com.aegis.controlroom.model.IncidentLocation loc = new com.aegis.controlroom.model.IncidentLocation();
			loc.setLocationId("loc-estimate-01");
			loc.setEmergencyId("emg-estimate-01");
			loc.setCallerLat(12.9716);
			loc.setCallerLng(77.5946);
			incidentLocationRepository.save(loc);
		}
		List<HospitalRankDto> ranks = hospitalDecisionEngineService.rankHospitalsForCase("emg-estimate-01", 1, false);
		assertNotNull(ranks);
		assertFalse(ranks.isEmpty());
		assertNotNull(hospitalRepository.findById(ranks.get(0).getHospitalId()).orElse(null));

		HospitalRankDto top = ranks.get(0);
		double expectedMax = Math.max(top.getTravelEtaMins(), top.getResourceReadyDelayMins()) + top.getHandoverDelayMins();
		assertEquals(Math.round(expectedMax * 10.0) / 10.0, top.getTotalTransparentEstimateMins());
	}
}
