package com.aegis.controlroom.dto;

public class LocationConfirmDto {
    private Double latitude;
    private Double longitude;
    private Double accuracyMeters;
    private String address;
    private String buildingFloorNotes;
    private String confirmedBy;

    public LocationConfirmDto() {}

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Double getAccuracyMeters() { return accuracyMeters; }
    public void setAccuracyMeters(Double accuracyMeters) { this.accuracyMeters = accuracyMeters; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getBuildingFloorNotes() { return buildingFloorNotes; }
    public void setBuildingFloorNotes(String buildingFloorNotes) { this.buildingFloorNotes = buildingFloorNotes; }
    public String getConfirmedBy() { return confirmedBy; }
    public void setConfirmedBy(String confirmedBy) { this.confirmedBy = confirmedBy; }
}
