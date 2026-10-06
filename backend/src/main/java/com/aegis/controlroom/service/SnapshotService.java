package com.aegis.controlroom.service;

import com.aegis.controlroom.repository.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class SnapshotService {

    private final EmergencyCaseRepository emergencyCaseRepository;
    private final MissionRepository missionRepository;
    private final AmbulanceRepository ambulanceRepository;
    private final HospitalRepository hospitalRepository;
    private final DispatchOfferRepository dispatchOfferRepository;
    private final RoadblockRepository roadblockRepository;
    private final AuditEventRepository auditEventRepository;
    private final ReservationRepository reservationRepository;

    public SnapshotService(EmergencyCaseRepository emergencyCaseRepository,
                           MissionRepository missionRepository,
                           AmbulanceRepository ambulanceRepository,
                           HospitalRepository hospitalRepository,
                           DispatchOfferRepository dispatchOfferRepository,
                           RoadblockRepository roadblockRepository,
                           AuditEventRepository auditEventRepository,
                           ReservationRepository reservationRepository) {
        this.emergencyCaseRepository = emergencyCaseRepository;
        this.missionRepository = missionRepository;
        this.ambulanceRepository = ambulanceRepository;
        this.hospitalRepository = hospitalRepository;
        this.dispatchOfferRepository = dispatchOfferRepository;
        this.roadblockRepository = roadblockRepository;
        this.auditEventRepository = auditEventRepository;
        this.reservationRepository = reservationRepository;
    }

    public Map<String, Object> fullSnapshot() {
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("generatedAt", Instant.now().toString());
        snap.put("cases", emergencyCaseRepository.findAll());
        snap.put("missions", missionRepository.findAll());
        snap.put("ambulances", ambulanceRepository.findAll());
        snap.put("hospitals", hospitalRepository.findAll());
        snap.put("offers", dispatchOfferRepository.findAll());
        snap.put("roadblocks", roadblockRepository.findAll());
        snap.put("reservations", reservationRepository.findAll());
        snap.put("recentAudits", auditEventRepository.findAll().stream().limit(100).toList());
        return snap;
    }
}
