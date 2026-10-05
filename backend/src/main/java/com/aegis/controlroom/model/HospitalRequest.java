package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "hospital_requests")
public class HospitalRequest {
    @Id
    @Column(name = "request_id", length = 64)
    private String requestId;

    @Column(name = "emergency_id", nullable = false, length = 64)
    private String emergencyId;

    @Column(name = "hospital_id", nullable = false, length = 64)
    private String hospitalId;

    @Column(name = "status", nullable = false, length = 30)
    private String status = "REQUESTED"; // REQUESTED, ACCEPTED, REJECTED, RESERVED, EXPIRED

    @Column(name = "required_beds", nullable = false)
    private Integer requiredBeds = 1;

    @Column(name = "required_icu", nullable = false)
    private Boolean requiredIcu = false;

    @Column(name = "requested_at")
    private Instant requestedAt = Instant.now();

    @Column(name = "responded_at")
    private Instant respondedAt;

    public HospitalRequest() {}

    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getRequiredBeds() { return requiredBeds; }
    public void setRequiredBeds(Integer requiredBeds) { this.requiredBeds = requiredBeds; }
    public Boolean getRequiredIcu() { return requiredIcu; }
    public void setRequiredIcu(Boolean requiredIcu) { this.requiredIcu = requiredIcu; }
    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }
    public Instant getRespondedAt() { return respondedAt; }
    public void setRespondedAt(Instant respondedAt) { this.respondedAt = respondedAt; }
}
