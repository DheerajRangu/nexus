package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "green_corridor_signals")
public class GreenCorridorSignal {
    @Id
    @Column(name = "junction_id", length = 64)
    private String junctionId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "latitude", nullable = false)
    private Double latitude;

    @Column(name = "longitude", nullable = false)
    private Double longitude;

    @Column(name = "current_state", nullable = false, length = 30)
    private String currentState = "UNAVAILABLE"; // REQUESTED, ACKNOWLEDGED, CLEARING, ACTIVE, PASSED, EXPIRED, UNAVAILABLE

    @Column(name = "active_mission_id", length = 64)
    private String activeMissionId;

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    public GreenCorridorSignal() {}

    public String getJunctionId() { return junctionId; }
    public void setJunctionId(String junctionId) { this.junctionId = junctionId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public String getCurrentState() { return currentState; }
    public void setCurrentState(String currentState) { this.currentState = currentState; }
    public String getActiveMissionId() { return activeMissionId; }
    public void setActiveMissionId(String activeMissionId) { this.activeMissionId = activeMissionId; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
