package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "emergency_cases")
public class EmergencyCase {
    @Id
    @Column(name = "emergency_id", length = 64)
    private String emergencyId;

    @Column(name = "external_call_ref", length = 100)
    private String externalCallRef;

    @Column(name = "callback_number", nullable = false, length = 30)
    private String callbackNumber;

    @Column(name = "operator_id", length = 64)
    private String operatorId;

    @Column(name = "chief_complaint", length = 100)
    private String chiefComplaint;

    @Column(name = "triage_priority", nullable = false, length = 30)
    private String triagePriority = "P3_STANDARD";

    @Column(name = "raw_operator_notes", columnDefinition = "TEXT")
    private String rawOperatorNotes;

    @Column(name = "location_confirmed", nullable = false)
    private Boolean locationConfirmed = false;

    @Column(name = "provisional_dispatch", nullable = false)
    private Boolean provisionalDispatch = false;

    @Column(name = "current_state", nullable = false, length = 50)
    private String currentState = "INTAKE_CREATED";

    @Column(name = "assigned_ambulance_id", length = 64)
    private String assignedAmbulanceId;

    @Column(name = "reserved_hospital_id", length = 64)
    private String reservedHospitalId;

    @Version
    @Column(name = "entity_version", nullable = false)
    private Integer entityVersion = 1;

    @Column(name = "created_at")
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    public EmergencyCase() {}

    public String getEmergencyId() { return emergencyId; }
    public void setEmergencyId(String emergencyId) { this.emergencyId = emergencyId; }
    public String getExternalCallRef() { return externalCallRef; }
    public void setExternalCallRef(String externalCallRef) { this.externalCallRef = externalCallRef; }
    public String getCallbackNumber() { return callbackNumber; }
    public void setCallbackNumber(String callbackNumber) { this.callbackNumber = callbackNumber; }
    public String getOperatorId() { return operatorId; }
    public void setOperatorId(String operatorId) { this.operatorId = operatorId; }
    public String getChiefComplaint() { return chiefComplaint; }
    public void setChiefComplaint(String chiefComplaint) { this.chiefComplaint = chiefComplaint; }
    public String getTriagePriority() { return triagePriority; }
    public void setTriagePriority(String triagePriority) { this.triagePriority = triagePriority; }
    public String getRawOperatorNotes() { return rawOperatorNotes; }
    public void setRawOperatorNotes(String rawOperatorNotes) { this.rawOperatorNotes = rawOperatorNotes; }
    public Boolean getLocationConfirmed() { return locationConfirmed; }
    public void setLocationConfirmed(Boolean locationConfirmed) { this.locationConfirmed = locationConfirmed; }
    public Boolean getProvisionalDispatch() { return provisionalDispatch; }
    public void setProvisionalDispatch(Boolean provisionalDispatch) { this.provisionalDispatch = provisionalDispatch; }
    public String getCurrentState() { return currentState; }
    public void setCurrentState(String currentState) { this.currentState = currentState; }
    public String getAssignedAmbulanceId() { return assignedAmbulanceId; }
    public void setAssignedAmbulanceId(String assignedAmbulanceId) { this.assignedAmbulanceId = assignedAmbulanceId; }
    public String getReservedHospitalId() { return reservedHospitalId; }
    public void setReservedHospitalId(String reservedHospitalId) { this.reservedHospitalId = reservedHospitalId; }
    public Integer getEntityVersion() { return entityVersion; }
    public void setEntityVersion(Integer entityVersion) { this.entityVersion = entityVersion; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
