package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.RouteVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RouteVersionRepository extends JpaRepository<RouteVersion, String> {
    List<RouteVersion> findByMissionIdOrderByVersionNumberDesc(String missionId);
    Optional<RouteVersion> findFirstByMissionIdOrderByVersionNumberDesc(String missionId);
}
