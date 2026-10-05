package com.aegis.controlroom.dto;

import java.util.List;

public class AmbulanceRankDto {
    private String ambulanceId;
    private String licensePlate;
    private String capabilityTier;
    private Double distanceKm;
    private Double rawEtaMins;
    private Double correctedEtaMins;
    private Double score;
    private List<String> reasons;
    private String driverId;

    public AmbulanceRankDto() {}

    public String getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(String ambulanceId) { this.ambulanceId = ambulanceId; }
    public String getLicensePlate() { return licensePlate; }
    public void setLicensePlate(String licensePlate) { this.licensePlate = licensePlate; }
    public String getCapabilityTier() { return capabilityTier; }
    public void setCapabilityTier(String capabilityTier) { this.capabilityTier = capabilityTier; }
    public Double getDistanceKm() { return distanceKm; }
    public void setDistanceKm(Double distanceKm) { this.distanceKm = distanceKm; }
    public Double getRawEtaMins() { return rawEtaMins; }
    public void setRawEtaMins(Double rawEtaMins) { this.rawEtaMins = rawEtaMins; }
    public Double getCorrectedEtaMins() { return correctedEtaMins; }
    public void setCorrectedEtaMins(Double correctedEtaMins) { this.correctedEtaMins = correctedEtaMins; }
    public Double getScore() { return score; }
    public void setScore(Double score) { this.score = score; }
    public List<String> getReasons() { return reasons; }
    public void setReasons(List<String> reasons) { this.reasons = reasons; }
    public String getDriverId() { return driverId; }
    public void setDriverId(String driverId) { this.driverId = driverId; }
}
