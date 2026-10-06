package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "missions")
public class Mission {
    @Id
    @Column(name = "mission_id", length = 64)
    private String missionId;

    @Column(name = "emergency_id", nullable = false, unique = true, length = 64)
    private String emergencyId;

    @Column(name = "ambulance_id", nullable = false, length = 64)
    private String ambulanceId;

    @Column(name = "driver_id", nullable = false, length = 64)
    private String driverId;

    @Column(name = "assigned_hospital_id", length = 64)
    private String assignedHospitalId;

    @Column(name = "current_state", nullable = false, length = 50)
    private String currentState = "ASSIGNED";

    @Column(name = "pickup_eta_mins")
    private Double pickupEtaMins;

    @Column(name = "hospital_eta_mins")
    private Double hospitalEtaMins;

    @Version
    @Column(name = "entity_version", nullable = false)
    private Integer entityVersion = 1;

    @Column(name = "started_at")
    private Instant startedAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;

    public Mission() {}

    public String getMissionId() { return missionId; }
    public void setMissionId(String missionId) { this.missionId = missionId; }
    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public String getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(String ambulanceId) { this.ambulanceId = ambulanceId; }
    public String getDriverId() { return driverId; }
    public void setDriverId(String driverId) { this.driverId = driverId; }
    public String getAssignedHospitalId() { return assignedHospitalId; }
    public void setAssignedHospitalId(String assignedHospitalId) { this.assignedHospitalId = assignedHospitalId; }
    public String getCurrentState() { return currentState; }
    public void setCurrentState(String currentState) { this.currentState = currentState; }
    public Double getPickupEtaMins() { return pickupEtaMins; }
    public void setPickupEtaMins(Double pickupEtaMins) { this.pickupEtaMins = pickupEtaMins; }
    public Double getHospitalEtaMins() { return hospitalEtaMins; }
    public void setHospitalEtaMins(Double hospitalEtaMins) { this.hospitalEtaMins = hospitalEtaMins; }
    public Integer getEntityVersion() { return entityVersion; }
    public void setEntityVersion(Integer entityVersion) { this.entityVersion = entityVersion; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
}
