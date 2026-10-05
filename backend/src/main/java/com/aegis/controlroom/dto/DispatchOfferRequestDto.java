package com.aegis.controlroom.dto;

public class DispatchOfferRequestDto {
    private String emergencyId;
    private String ambulanceId;

    public DispatchOfferRequestDto() {}

    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public String getAmbulanceId() { return ambulanceId; }
    public void setAmbulanceId(String ambulanceId) { this.ambulanceId = ambulanceId; }
}
