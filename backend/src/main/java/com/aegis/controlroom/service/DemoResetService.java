package com.aegis.controlroom.service;

import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.model.Hospital;
import com.aegis.controlroom.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class DemoResetService {

    private final EmergencyCaseRepository emergencyCaseRepository;
    private final IncidentLocationRepository incidentLocationRepository;
    private final DispatchOfferRepository dispatchOfferRepository;
    private final MissionRepository missionRepository;
    private final HospitalRequestRepository hospitalRequestRepository;
    private final ReservationRepository reservationRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final HospitalRepository hospitalRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    public DemoResetService(EmergencyCaseRepository emergencyCaseRepository,
                            IncidentLocationRepository incidentLocationRepository,
                            DispatchOfferRepository dispatchOfferRepository,
                            MissionRepository missionRepository,
                            HospitalRequestRepository hospitalRequestRepository,
                            ReservationRepository reservationRepository,
                            AmbulanceRepository ambulanceRepository,
                            HospitalRepository hospitalRepository,
                            WebSocketNotificationService webSocketNotificationService) {
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.incidentLocationRepository = incidentLocationRepository;
        this.dispatchOfferRepository = dispatchOfferRepository;
        this.missionRepository = missionRepository;
        this.hospitalRequestRepository = hospitalRequestRepository;
        this.reservationRepository = reservationRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.hospitalRepository = hospitalRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    @Transactional
    public void resetAllOperationalData() {
        reservationRepository.deleteAll();
        hospitalRequestRepository.deleteAll();
        missionRepository.deleteAll();
        dispatchOfferRepository.deleteAll();
        incidentLocationRepository.deleteAll();
        emergencyCaseRepository.deleteAll();

        // Reset Ambulances
        List<Ambulance> ambulances = ambulanceRepository.findAll();
        for (Ambulance amb : ambulances) {
            amb.setIsAvailable(true);
            amb.setStatus("IDLE");
            ambulanceRepository.save(amb);
        }

        // Reset Hospital bed counts
        List<Hospital> hospitals = hospitalRepository.findAll();
        for (Hospital h : hospitals) {
            if (h.getHospitalId().contains("GENERAL")) {
                h.setAvailableBeds(14);
                h.setAvailableIcu(3);
            } else if (h.getHospitalId().contains("JUDE")) {
                h.setAvailableBeds(8);
                h.setAvailableIcu(1);
            } else {
                h.setAvailableBeds(2);
                h.setAvailableIcu(0);
            }
            hospitalRepository.save(h);
        }

        webSocketNotificationService.broadcastEvent("/topic/system", "DEMO_SYSTEM_RESET", "SYSTEM", "All operational data reset to clean seed state.");
    }

    @Transactional
    public void injectScenarioFullHospitals() {
        List<Hospital> hospitals = hospitalRepository.findAll();
        for (Hospital h : hospitals) {
            h.setAvailableBeds(0);
            h.setAvailableIcu(0);
            hospitalRepository.save(h);
        }
        webSocketNotificationService.broadcastEvent("/topic/system", "SCENARIO_FULL_HOSPITALS", "SYSTEM", "Injected scenario: All hospital beds exhausted.");
    }

    @Transactional
    public void injectScenarioNoAvailableAmbulances() {
        List<Ambulance> ambulances = ambulanceRepository.findAll();
        for (Ambulance amb : ambulances) {
            amb.setIsAvailable(false);
            amb.setStatus("ON_CALL");
            ambulanceRepository.save(amb);
        }
        webSocketNotificationService.broadcastEvent("/topic/system", "SCENARIO_NO_AMBULANCES", "SYSTEM", "Injected scenario: All ambulances busy on active calls.");
    }
}
