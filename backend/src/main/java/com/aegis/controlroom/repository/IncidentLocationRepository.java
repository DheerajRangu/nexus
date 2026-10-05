package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.IncidentLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface IncidentLocationRepository extends JpaRepository<IncidentLocation, String> {
    Optional<IncidentLocation> findByEmergencyId(String emergencyId);
}
