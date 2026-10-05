package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HospitalRepository extends JpaRepository<Hospital, String> {
    List<Hospital> findByAvailableBedsGreaterThanEqual(Integer minBeds);
}
