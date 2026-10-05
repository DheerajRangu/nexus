package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "incident_locations")
public class IncidentLocation {
    @Id
    @Column(name = "location_id", length = 64)
    private String locationId;

    @Column(name = "emergency_id", nullable = false, unique = true, length = 64)
    private String emergencyId;

    @Column(name = "caller_lat")
    private Double callerLat;

    @Column(name = "caller_lng")
    private Double callerLng;

    @Column(name = "caller_accuracy_meters")
    private Double callerAccuracyMeters;

    @Column(name = "confirmed_lat")
    private Double confirmedLat;

    @Column(name = "confirmed_lng")
    private Double confirmedLng;

    @Column(name = "confirmed_address", columnDefinition = "TEXT")
    private String confirmedAddress;

    @Column(name = "building_floor_notes", columnDefinition = "TEXT")
    private String buildingFloorNotes;

    @Column(name = "location_source", nullable = false, length = 50)
    private String locationSource = "CALLER_GPS";

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    public IncidentLocation() {}

    public String getLocationId() { return locationId; }
    public void setLocationId(String locationId) { this.locationId = locationId; }
    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public Double getCallerLat() { return callerLat; }
    public void setCallerLat(Double callerLat) { this.callerLat = callerLat; }
    public Double getCallerLng() { return callerLng; }
    public void setCallerLng(Double callerLng) { this.callerLng = callerLng; }
    public Double getCallerAccuracyMeters() { return callerAccuracyMeters; }
    public void setCallerAccuracyMeters(Double callerAccuracyMeters) { this.callerAccuracyMeters = callerAccuracyMeters; }
    public Double getConfirmedLat() { return confirmedLat; }
    public void setConfirmedLat(Double confirmedLat) { this.confirmedLat = confirmedLat; }
    public Double getConfirmedLng() { return confirmedLng; }
    public void setConfirmedLng(Double confirmedLng) { this.confirmedLng = confirmedLng; }
    public String getConfirmedAddress() { return confirmedAddress; }
    public void setConfirmedAddress(String confirmedAddress) { this.confirmedAddress = confirmedAddress; }
    public String getBuildingFloorNotes() { return buildingFloorNotes; }
    public void setBuildingFloorNotes(String buildingFloorNotes) { this.buildingFloorNotes = buildingFloorNotes; }
    public String getLocationSource() { return locationSource; }
    public void setLocationSource(String locationSource) { this.locationSource = locationSource; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
