package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.DispatchOffer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface DispatchOfferRepository extends JpaRepository<DispatchOffer, String> {
    List<DispatchOffer> findByEmergencyIdAndStatus(String emergencyId, String status);
    Optional<DispatchOffer> findByEmergencyIdAndAmbulanceIdAndStatus(String emergencyId, String ambulanceId, String status);
    List<DispatchOffer> findByDriverIdAndStatus(String driverId, String status);
}
