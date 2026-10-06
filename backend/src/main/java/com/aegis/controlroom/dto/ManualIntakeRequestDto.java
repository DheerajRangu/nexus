package com.aegis.controlroom.dto;

public class ManualIntakeRequestDto {
    private String callbackNumber;
    private String chiefComplaint;
    private String priority;
    private String notes;
    private String addressLandmark;
    private String buildingDetails;
    private Boolean provisionalDispatch = false;
    private Double latitude;
    private Double longitude;
    private Double accuracyMeters;

    public ManualIntakeRequestDto() {}

    public String getCallbackNumber() { return callbackNumber; }
    public void setCallbackNumber(String callbackNumber) { this.callbackNumber = callbackNumber; }
    public String getChiefComplaint() { return chiefComplaint; }
    public void setChiefComplaint(String chiefComplaint) { this.chiefComplaint = chiefComplaint; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getAddressLandmark() { return addressLandmark; }
    public void setAddressLandmark(String addressLandmark) { this.addressLandmark = addressLandmark; }
    public String getBuildingDetails() { return buildingDetails; }
    public void setBuildingDetails(String buildingDetails) { this.buildingDetails = buildingDetails; }
    public Boolean getProvisionalDispatch() { return provisionalDispatch; }
    public void setProvisionalDispatch(Boolean provisionalDispatch) { this.provisionalDispatch = provisionalDispatch; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Double getAccuracyMeters() { return accuracyMeters; }
    public void setAccuracyMeters(Double accuracyMeters) { this.accuracyMeters = accuracyMeters; }
}
