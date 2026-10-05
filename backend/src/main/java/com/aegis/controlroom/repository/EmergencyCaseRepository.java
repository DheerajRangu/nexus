package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.EmergencyCase;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface EmergencyCaseRepository extends JpaRepository<EmergencyCase, String> {
    List<EmergencyCase> findByCurrentStateNot(String state);
    Optional<EmergencyCase> findByExternalCallRef(String externalCallRef);
}
