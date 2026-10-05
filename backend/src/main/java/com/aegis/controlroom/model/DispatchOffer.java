package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "dispatch_offers")
public class DispatchOffer {
    @Id
    @Column(name = "offer_id", length = 64)
    private String offerId;

    @Column(name = "emergency_id", nullable = false, length = 64)
    private String emergencyId;

    @Column(name = "ambulance_id", nullable = false, length = 64)
    private String ambulanceId;

    @Column(name = "driver_id", nullable = false, length = 64)
    private String driverId;

    @Column(name = "status", nullable = false, length = 30)
    private String status = "OFFERED"; // OFFERED, ACCEPTED, DECLINED, EXPIRED

    @Column(name = "offered_at")
    private Instant offeredAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "responded_at")
    private Instant respondedAt;

    public DispatchOffer() {}

    public String getOfferId() { return offerId; }
    public void setOfferId(String offerId) { this.offerId = offerId; }
    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public String getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(String ambulanceId) { this.ambulanceId = ambulanceId; }
    public String getDriverId() { return driverId; }
    public void setDriverId(String driverId) { this.driverId = driverId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getOfferedAt() { return offeredAt; }
    public void setOfferedAt(Instant offeredAt) { this.offeredAt = offeredAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getRespondedAt() { return respondedAt; }
    public void setRespondedAt(Instant respondedAt) { this.respondedAt = respondedAt; }
}
