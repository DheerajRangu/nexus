package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "route_versions")
public class RouteVersion {
    @Id
    @Column(name = "route_id", length = 64)
    private String routeId;

    @Column(name = "mission_id", nullable = false, length = 64)
    private String missionId;

    @Column(name = "version_number", nullable = false)
    private Integer versionNumber;

    @Column(name = "encoded_polyline", nullable = false, columnDefinition = "TEXT")
    private String encodedPolyline;

    @Column(name = "distance_km", nullable = false)
    private Double distanceKm;

    @Column(name = "estimated_duration_mins", nullable = false)
    private Double estimatedDurationMins;

    @Column(name = "avoided_roadblocks_count", nullable = false)
    private Integer avoidedRoadblocksCount = 0;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public RouteVersion() {}

    public String getRouteId() { return routeId; }
    public void setRouteId(String routeId) { this.routeId = routeId; }
    public String getMissionId() { return missionId; }
    public void setMissionId(String missionId) { this.missionId = missionId; }
    public Integer getVersionNumber() { return versionNumber; }
    public void setVersionNumber(Integer versionNumber) { this.versionNumber = versionNumber; }
    public String getEncodedPolyline() { return encodedPolyline; }
    public void setEncodedPolyline(String encodedPolyline) { this.encodedPolyline = encodedPolyline; }
    public Double getDistanceKm() { return distanceKm; }
    public void setDistanceKm(Double distanceKm) { this.distanceKm = distanceKm; }
    public Double getEstimatedDurationMins() { return estimatedDurationMins; }
    public void setEstimatedDurationMins(Double estimatedDurationMins) { this.estimatedDurationMins = estimatedDurationMins; }
    public Integer getAvoidedRoadblocksCount() { return avoidedRoadblocksCount; }
    public void setAvoidedRoadblocksCount(Integer avoidedRoadblocksCount) { this.avoidedRoadblocksCount = avoidedRoadblocksCount; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
