package com.aegis.controlroom.dto;

public class InboundCallWebhookDto {
    private String externalCallRef;
    private String callbackNumber;
    private String operatorId;
    private String rawNotes;
    private Double callerLat;
    private Double callerLng;
    private Double accuracyMeters;

    public InboundCallWebhookDto() {}

    public String getExternalCallRef() { return externalCallRef; }
    public void setExternalCallRef(String externalCallRef) { this.externalCallRef = externalCallRef; }
    public String getCallbackNumber() { return callbackNumber; }
    public void setCallbackNumber(String callbackNumber) { this.callbackNumber = callbackNumber; }
    public String getOperatorId() { return operatorId; }
    public void setOperatorId(String operatorId) { this.operatorId = operatorId; }
    public String getRawNotes() { return rawNotes; }
    public void setRawNotes(String rawNotes) { this.rawNotes = rawNotes; }
    public Double getCallerLat() { return callerLat; }
    public void setCallerLat(Double callerLat) { this.callerLat = callerLat; }
    public Double getCallerLng() { return callerLng; }
    public void setCallerLng(Double callerLng) { this.callerLng = callerLng; }
    public Double getAccuracyMeters() { return accuracyMeters; }
    public void setAccuracyMeters(Double accuracyMeters) { this.accuracyMeters = accuracyMeters; }
}
