package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.Reservation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.List;

public interface ReservationRepository extends JpaRepository<Reservation, String> {
    Optional<Reservation> findByEmergencyIdAndStatus(String emergencyId, String status);
    List<Reservation> findByHospitalId(String hospitalId);
}
