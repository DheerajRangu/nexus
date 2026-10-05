package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.Ambulance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface AmbulanceRepository extends JpaRepository<Ambulance, String> {
    List<Ambulance> findByIsAvailableTrue();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Ambulance a WHERE a.ambulanceId = :ambulanceId")
    Optional<Ambulance> findByIdForUpdate(String ambulanceId);
}
