package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ambulances")
public class Ambulance {
    @Id
    @Column(name = "ambulance_id", length = 64)
    private String ambulanceId;

    @Column(name = "license_plate", nullable = false, unique = true, length = 30)
    private String licensePlate;

    @Column(name = "capability_tier", nullable = false, length = 50)
    private String capabilityTier; // ALS, BLS, PATIENT_TRANSPORT

    @Column(name = "has_ventilator", nullable = false)
    private Boolean hasVentilator = false;

    @Column(name = "has_defibrillator", nullable = false)
    private Boolean hasDefibrillator = false;

    @Column(name = "latitude", nullable = false)
    private Double latitude;

    @Column(name = "longitude", nullable = false)
    private Double longitude;

    @Column(name = "telemetry_updated_at")
    private Instant telemetryUpdatedAt = Instant.now();

    @Column(name = "is_available", nullable = false)
    private Boolean isAvailable = true;

    @Column(name = "status", nullable = false, length = 50)
    private String status = "IDLE";

    @Column(name = "assigned_driver_id", length = 64)
    private String assignedDriverId;

    @Version
    @Column(name = "entity_version", nullable = false)
    private Integer entityVersion = 1;

    public Ambulance() {}

    public String getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(String ambulanceId) { this.ambulanceId = ambulanceId; }
    public String getLicensePlate() { return licensePlate; }
    public void setLicensePlate(String licensePlate) { this.licensePlate = licensePlate; }
    public String getCapabilityTier() { return capabilityTier; }
    public void setCapabilityTier(String capabilityTier) { this.capabilityTier = capabilityTier; }
    public Boolean getHasVentilator() { return hasVentilator; }
    public void setHasVentilator(Boolean hasVentilator) { this.hasVentilator = hasVentilator; }
    public Boolean getHasDefibrillator() { return hasDefibrillator; }
    public void setHasDefibrillator(Boolean hasDefibrillator) { this.hasDefibrillator = hasDefibrillator; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Instant getTelemetryUpdatedAt() { return telemetryUpdatedAt; }
    public void setTelemetryUpdatedAt(Instant telemetryUpdatedAt) { this.telemetryUpdatedAt = telemetryUpdatedAt; }
    public Boolean getIsAvailable() { return isAvailable; }
    public void setIsAvailable(Boolean isAvailable) { this.isAvailable = isAvailable; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getAssignedDriverId() { return assignedDriverId; }
    public void setAssignedDriverId(String assignedDriverId) { this.assignedDriverId = assignedDriverId; }
    public Integer getEntityVersion() { return entityVersion; }
    public void setEntityVersion(Integer entityVersion) { this.entityVersion = entityVersion; }
}
