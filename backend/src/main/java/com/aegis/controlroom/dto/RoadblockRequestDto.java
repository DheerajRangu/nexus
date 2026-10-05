package com.aegis.controlroom.dto;

public class RoadblockRequestDto {
    private String source;
    private Double latitude;
    private Double longitude;
    private Double radiusMeters = 100.0;
    private String scope = "FULL_BLOCK";
    private Integer durationMinutes = 60;

    public RoadblockRequestDto() {}

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Double getRadiusMeters() { return radiusMeters; }
    public void setRadiusMeters(Double radiusMeters) { this.radiusMeters = radiusMeters; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }
}
