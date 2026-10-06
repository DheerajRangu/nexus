package com.aegis.controlroom.security;

import com.aegis.controlroom.model.Hospital;
import com.aegis.controlroom.model.Mission;
import com.aegis.controlroom.repository.HospitalRepository;
import com.aegis.controlroom.repository.MissionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ScopeGuard {

    private final MissionRepository missionRepository;
    private final HospitalRepository hospitalRepository;

    public ScopeGuard(MissionRepository missionRepository, HospitalRepository hospitalRepository) {
        this.missionRepository = missionRepository;
        this.hospitalRepository = hospitalRepository;
    }

    public Mission readMission(String missionId) {
        AegisPrincipal principal = principal();
        Mission mission = missionRepository.findById(missionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("ROLE_DRIVER".equals(principal.role()) && !mission.getDriverId().equals(principal.userId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return mission;
    }

    public Hospital readHospital(String hospitalId) {
        AegisPrincipal principal = principal();
        if ("ROLE_HOSPITAL_STAFF".equals(principal.role()) && !hospitalId.equals(principal.scope())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static AegisPrincipal principal() {
        Object raw = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (raw instanceof AegisPrincipal principal) {
            return principal;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
}
