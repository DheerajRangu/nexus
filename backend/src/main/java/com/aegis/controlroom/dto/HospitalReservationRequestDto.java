package com.aegis.controlroom.dto;

import java.util.List;

public class HospitalReservationRequestDto {
    private String emergencyId;
    private String hospitalId;
    private Integer requiredBeds = 1;
    private Boolean requiredIcu = false;
    private List<String> requiredEquipment;

    public HospitalReservationRequestDto() {}

    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }
    public Integer getRequiredBeds() { return requiredBeds; }
    public void setRequiredBeds(Integer requiredBeds) { this.requiredBeds = requiredBeds; }
    public Boolean getRequiredIcu() { return requiredIcu; }
    public void setRequiredIcu(Boolean requiredIcu) { this.requiredIcu = requiredIcu; }
    public List<String> getRequiredEquipment() { return requiredEquipment; }
    public void setRequiredEquipment(List<String> requiredEquipment) { this.requiredEquipment = requiredEquipment; }
}
