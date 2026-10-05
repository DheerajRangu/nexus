package com.aegis.controlroom.dto;

public class GreenCorridorUpdateDto {
    private String state; // REQUESTED, ACKNOWLEDGED, CLEARING, ACTIVE, PASSED, EXPIRED, UNAVAILABLE
    private String missionId;

    public GreenCorridorUpdateDto() {}

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getMissionId() { return missionId; }
    public void setMissionId(String missionId) { this.missionId = missionId; }
}
