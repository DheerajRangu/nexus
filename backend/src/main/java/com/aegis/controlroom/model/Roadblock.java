package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "roadblocks")
public class Roadblock {
    @Id
    @Column(name = "roadblock_id", length = 64)
    private String roadblockId;

    @Column(name = "source", nullable = false, length = 100)
    private String source;

    @Column(name = "latitude", nullable = false)
    private Double latitude;

    @Column(name = "longitude", nullable = false)
    private Double longitude;

    @Column(name = "radius_meters", nullable = false)
    private Double radiusMeters = 100.0;

    @Column(name = "scope", nullable = false, length = 50)
    private String scope = "FULL_BLOCK";

    @Column(name = "verified", nullable = false)
    private Boolean verified = true;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public Roadblock() {}

    public String getRoadblockId() { return roadblockId; }
    public void setRoadblockId(String roadblockId) { this.roadblockId = roadblockId; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Double getRadiusMeters() { return radiusMeters; }
    public void setRadiusMeters(Double radiusMeters) { this.radiusMeters = radiusMeters; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public Boolean getVerified() { return verified; }
    public void setVerified(Boolean verified) { this.verified = verified; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
