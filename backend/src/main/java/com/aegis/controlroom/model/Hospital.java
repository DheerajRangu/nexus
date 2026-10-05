package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "hospitals")
public class Hospital {
    @Id
    @Column(name = "hospital_id", length = 64)
    private String hospitalId;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "latitude", nullable = false)
    private Double latitude;

    @Column(name = "longitude", nullable = false)
    private Double longitude;

    @Column(name = "available_beds", nullable = false)
    private Integer availableBeds;

    @Column(name = "available_icu", nullable = false)
    private Integer availableIcu;

    @Column(name = "has_trauma_center", nullable = false)
    private Boolean hasTraumaCenter = false;

    @Column(name = "has_cardiac_cath_lab", nullable = false)
    private Boolean hasCardiacCathLab = false;

    @Column(name = "emergency_workload", nullable = false, length = 30)
    private String emergencyWorkload = "NORMAL";

    @Column(name = "resource_updated_at")
    private Instant resourceUpdatedAt = Instant.now();

    public Hospital() {}

    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Integer getAvailableBeds() { return availableBeds; }
    public void setAvailableBeds(Integer availableBeds) { this.availableBeds = availableBeds; }
    public Integer getAvailableIcu() { return availableIcu; }
    public void setAvailableIcu(Integer availableIcu) { this.availableIcu = availableIcu; }
    public Boolean getHasTraumaCenter() { return hasTraumaCenter; }
    public void setHasTraumaCenter(Boolean hasTraumaCenter) { this.hasTraumaCenter = hasTraumaCenter; }
    public Boolean getHasCardiacCathLab() { return hasCardiacCathLab; }
    public void setHasCardiacCathLab(Boolean hasCardiacCathLab) { this.hasCardiacCathLab = hasCardiacCathLab; }
    public String getEmergencyWorkload() { return emergencyWorkload; }
    public void setEmergencyWorkload(String emergencyWorkload) { this.emergencyWorkload = emergencyWorkload; }
    public Instant getResourceUpdatedAt() { return resourceUpdatedAt; }
    public void setResourceUpdatedAt(Instant resourceUpdatedAt) { this.resourceUpdatedAt = resourceUpdatedAt; }
}
