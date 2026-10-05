package com.aegis.controlroom.controller;

import com.aegis.controlroom.dto.HospitalRankDto;
import com.aegis.controlroom.dto.HospitalReservationRequestDto;
import com.aegis.controlroom.model.Hospital;
import com.aegis.controlroom.model.Reservation;
import com.aegis.controlroom.repository.HospitalRepository;
import com.aegis.controlroom.service.HospitalDecisionEngineService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/hospitals")
public class HospitalController {

    private final HospitalRepository hospitalRepository;
    private final HospitalDecisionEngineService hospitalDecisionEngineService;

    public HospitalController(HospitalRepository hospitalRepository, HospitalDecisionEngineService hospitalDecisionEngineService) {
        this.hospitalRepository = hospitalRepository;
        this.hospitalDecisionEngineService = hospitalDecisionEngineService;
    }

    @GetMapping
    public ResponseEntity<List<Hospital>> getAllHospitals() {
        return ResponseEntity.ok(hospitalRepository.findAll());
    }

    @GetMapping("/recommendations/{emergencyId}")
    public ResponseEntity<List<HospitalRankDto>> getHospitalRecommendations(
            @PathVariable String emergencyId,
            @RequestParam(defaultValue = "1") Integer requiredBeds,
            @RequestParam(defaultValue = "false") Boolean requiredIcu) {
        List<HospitalRankDto> ranks = hospitalDecisionEngineService.rankHospitalsForCase(emergencyId, requiredBeds, requiredIcu);
        return ResponseEntity.ok(ranks);
    }

    @PostMapping("/reservations")
    public ResponseEntity<Reservation> reserveBed(@RequestBody HospitalReservationRequestDto dto) {
        Reservation reservation = hospitalDecisionEngineService.reserveHospitalBed(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(reservation);
    }
}
