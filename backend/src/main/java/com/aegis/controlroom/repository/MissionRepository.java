package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.Mission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MissionRepository extends JpaRepository<Mission, String> {
    Optional<Mission> findByEmergencyId(String emergencyId);
    Optional<Mission> findByDriverIdAndCurrentStateNot(String driverId, String state);
    List<Mission> findByCurrentStateNot(String state);
    long countByEmergencyIdAndCurrentState(String emergencyId, String currentState);
    long countByAmbulanceIdAndCurrentStateNotIn(String ambulanceId, Collection<String> states);
}
