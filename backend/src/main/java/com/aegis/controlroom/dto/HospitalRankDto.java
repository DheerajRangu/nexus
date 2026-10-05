package com.aegis.controlroom.dto;

import java.util.List;

public class HospitalRankDto {
    private String hospitalId;
    private String name;
    private Double travelEtaMins;
    private Double resourceReadyDelayMins;
    private Double handoverDelayMins;
    private Double totalTransparentEstimateMins;
    private Integer availableBeds;
    private Integer availableIcu;
    private Boolean specialistReady;
    private Double score;
    private List<String> reasons;

    public HospitalRankDto() {}

    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Double getTravelEtaMins() { return travelEtaMins; }
    public void setTravelEtaMins(Double travelEtaMins) { this.travelEtaMins = travelEtaMins; }
    public Double getResourceReadyDelayMins() { return resourceReadyDelayMins; }
    public void setResourceReadyDelayMins(Double resourceReadyDelayMins) { this.resourceReadyDelayMins = resourceReadyDelayMins; }
    public Double getHandoverDelayMins() { return handoverDelayMins; }
    public void setHandoverDelayMins(Double handoverDelayMins) { this.handoverDelayMins = handoverDelayMins; }
    public Double getTotalTransparentEstimateMins() { return totalTransparentEstimateMins; }
    public void setTotalTransparentEstimateMins(Double totalTransparentEstimateMins) { this.totalTransparentEstimateMins = totalTransparentEstimateMins; }
    public Integer getAvailableBeds() { return availableBeds; }
    public void setAvailableBeds(Integer availableBeds) { this.availableBeds = availableBeds; }
    public Integer getAvailableIcu() { return availableIcu; }
    public void setAvailableIcu(Integer availableIcu) { this.availableIcu = availableIcu; }
    public Boolean getSpecialistReady() { return specialistReady; }
    public void setSpecialistReady(Boolean specialistReady) { this.specialistReady = specialistReady; }
    public Double getScore() { return score; }
    public void setScore(Double score) { this.score = score; }
    public List<String> getReasons() { return reasons; }
    public void setReasons(List<String> reasons) { this.reasons = reasons; }
}
