package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.TrackingSession;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface TrackingSessionRepository extends JpaRepository<TrackingSession, String> {
    Optional<TrackingSession> findByTrackingToken(String trackingToken);
    Optional<TrackingSession> findByEmergencyId(String emergencyId);
}
