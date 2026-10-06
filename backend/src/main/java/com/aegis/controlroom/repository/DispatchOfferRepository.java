package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.DispatchOffer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface DispatchOfferRepository extends JpaRepository<DispatchOffer, String> {
    List<DispatchOffer> findByEmergencyIdAndStatus(String emergencyId, String status);
    List<DispatchOffer> findByEmergencyIdOrderByOfferedAtDesc(String emergencyId);
    Optional<DispatchOffer> findByEmergencyIdAndAmbulanceIdAndStatus(String emergencyId, String ambulanceId, String status);
    List<DispatchOffer> findByDriverIdAndStatus(String driverId, String status);

    @Query("SELECT o FROM DispatchOffer o WHERE o.status = 'OFFERED' AND o.expiresAt < :now")
    List<DispatchOffer> findExpiredOpenOffers(@Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE DispatchOffer o
            SET o.status = 'ACCEPTED', o.respondedAt = :now
            WHERE o.offerId = :offerId AND o.status = 'OFFERED' AND o.expiresAt > :now
            """)
    int acceptIfStillOpen(@Param("offerId") String offerId, @Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE DispatchOffer o
            SET o.status = 'EXPIRED'
            WHERE o.offerId = :offerId AND o.status = 'OFFERED' AND o.expiresAt <= :now
            """)
    int expireIfStillOpen(@Param("offerId") String offerId, @Param("now") Instant now);

    long countByEmergencyIdAndStatus(String emergencyId, String status);
}
