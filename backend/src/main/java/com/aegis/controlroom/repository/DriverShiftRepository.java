package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.DriverShift;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DriverShiftRepository extends JpaRepository<DriverShift, String> {
    Optional<DriverShift> findFirstByAmbulanceIdAndIsActiveTrue(String ambulanceId);
}
