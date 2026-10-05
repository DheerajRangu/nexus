package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.HospitalRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface HospitalRequestRepository extends JpaRepository<HospitalRequest, String> {
    List<HospitalRequest> findByEmergencyId(String emergencyId);
    List<HospitalRequest> findByHospitalIdAndStatus(String hospitalId, String status);
}
