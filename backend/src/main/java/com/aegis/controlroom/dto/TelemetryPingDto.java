package com.aegis.controlroom.dto;

public class TelemetryPingDto {
    private String ambulanceId;
    private Double latitude;
    private Double longitude;
    private Double speedKmh;
    private String status;

    public TelemetryPingDto() {}

    public String getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(String ambulanceId) { this.ambulanceId = ambulanceId; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Double getSpeedKmh() { return speedKmh; }
    public void setSpeedKmh(Double speedKmh) { this.speedKmh = speedKmh; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
