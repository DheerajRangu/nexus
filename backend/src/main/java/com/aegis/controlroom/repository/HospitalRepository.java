package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.Hospital;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface HospitalRepository extends JpaRepository<Hospital, String> {
    List<Hospital> findByAvailableBedsGreaterThanEqual(Integer minBeds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT h FROM Hospital h WHERE h.hospitalId = :hospitalId")
    Optional<Hospital> findByIdForUpdate(@Param("hospitalId") String hospitalId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Hospital h
            SET h.reservedBeds = h.reservedBeds + :beds, h.resourceUpdatedAt = CURRENT_TIMESTAMP
            WHERE h.hospitalId = :hospitalId
              AND h.reservedBeds + :beds <= h.availableBeds
            """)
    int reserveBedsIfAvailable(@Param("hospitalId") String hospitalId, @Param("beds") int beds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Hospital h
            SET h.reservedBeds = h.reservedBeds - :beds,
                h.availableBeds = h.availableBeds - :beds,
                h.resourceUpdatedAt = CURRENT_TIMESTAMP
            WHERE h.hospitalId = :hospitalId
              AND h.reservedBeds >= :beds
              AND h.availableBeds >= :beds
            """)
    int consumeReservedBeds(@Param("hospitalId") String hospitalId, @Param("beds") int beds);
}
