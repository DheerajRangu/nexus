package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "reservations")
public class Reservation {
    @Id
    @Column(name = "reservation_id", length = 64)
    private String reservationId;

    @Column(name = "request_id", nullable = false, length = 64)
    private String requestId;

    @Column(name = "hospital_id", nullable = false, length = 64)
    private String hospitalId;

    @Column(name = "emergency_id", nullable = false, length = 64)
    private String emergencyId;

    @Column(name = "status", nullable = false, length = 30)
    private String status = "CONFIRMED"; // CONFIRMED, FULFILLED, CANCELLED

    @Column(name = "beds_reserved", nullable = false)
    private Integer bedsReserved = 1;

    @Column(name = "icu_reserved", nullable = false)
    private Boolean icuReserved = false;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    public Reservation() {}

    public String getReservationId() { return reservationId; }
    public void setReservationId(String reservationId) { this.reservationId = reservationId; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }
    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getBedsReserved() { return bedsReserved; }
    public void setBedsReserved(Integer bedsReserved) { this.bedsReserved = bedsReserved; }
    public Boolean getIcuReserved() { return icuReserved; }
    public void setIcuReserved(Boolean icuReserved) { this.icuReserved = icuReserved; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
