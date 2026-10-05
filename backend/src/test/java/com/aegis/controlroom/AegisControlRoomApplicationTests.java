package com.aegis.controlroom;

import com.aegis.controlroom.dto.AmbulanceRankDto;
import com.aegis.controlroom.dto.HospitalRankDto;
import com.aegis.controlroom.model.EmergencyCase;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.repository.EmergencyCaseRepository;
import com.aegis.controlroom.service.DispatchEngineService;
import com.aegis.controlroom.service.HospitalDecisionEngineService;
import com.aegis.controlroom.service.MissionStateMachineService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class AegisControlRoomApplicationTests {

	@Autowired
	private DispatchEngineService dispatchEngineService;

	@Autowired
	private HospitalDecisionEngineService hospitalDecisionEngineService;

	@Autowired
	private MissionStateMachineService missionStateMachineService;

	@Autowired
	private EmergencyCaseRepository emergencyCaseRepository;

	@Test
	void contextLoads() {
		assertNotNull(dispatchEngineService);
	}

	@Test
	void testHospitalTransparentPlanningEstimate() {
		List<HospitalRankDto> ranks = hospitalDecisionEngineService.rankHospitalsForCase("emg-seed-01", 1, false);
		assertNotNull(ranks);
		assertFalse(ranks.isEmpty());
		
		HospitalRankDto top = ranks.get(0);
		double expectedMax = Math.max(top.getTravelEtaMins(), top.getResourceReadyDelayMins()) + top.getHandoverDelayMins();
		assertEquals(Math.round(expectedMax * 10.0) / 10.0, top.getTotalTransparentEstimateMins());
	}
}
