package com.aegis.controlroom.service;

import com.aegis.controlroom.model.*;
import com.aegis.controlroom.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class MissionRoutingService {
    private static final Set<String> ACTIVE_STATES = Set.of("ASSIGNED", "EN_ROUTE_TO_PATIENT", "ON_SCENE", "TRANSPORTING");

    private final MissionRepository missions;
    private final AmbulanceRepository ambulances;
    private final IncidentLocationRepository locations;
    private final HospitalRepository hospitals;
    private final RoutingService routing;

    @Value("${aegis.dispatch.ping-freshness-seconds:120}")
    private long pingFreshnessSeconds;

    public MissionRoutingService(MissionRepository missions, AmbulanceRepository ambulances,
                                 IncidentLocationRepository locations, HospitalRepository hospitals,
                                 RoutingService routing) {
        this.missions = missions;
        this.ambulances = ambulances;
        this.locations = locations;
        this.hospitals = hospitals;
        this.routing = routing;
    }

    public List<Mission> activeMissions() {
        return missions.findAll().stream().filter(m -> ACTIVE_STATES.contains(m.getCurrentState())).toList();
    }

    @Transactional
    public Map<String, Object> currentRoute(String missionId) {
        Mission mission = missions.findById(missionId)
                .orElseThrow(() -> new IllegalArgumentException("Mission not found: " + missionId));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("missionId", missionId);
        result.put("emergencyId", mission.getEmergencyId());
        result.put("leg", "TRANSPORTING".equals(mission.getCurrentState()) ? "TO_HOSPITAL" : "TO_PATIENT");
        result.put("missionState", mission.getCurrentState());
        result.put("recalculatedAt", Instant.now());

        Ambulance ambulance = ambulances.findById(mission.getAmbulanceId()).orElse(null);
        if (ambulance == null || ambulance.getTelemetryUpdatedAt() == null
                || ambulance.getTelemetryUpdatedAt().isBefore(Instant.now().minus(pingFreshnessSeconds, ChronoUnit.SECONDS))) {
            result.put("routeAvailable", false);
            result.put("status", "LOCATION_STALE");
            result.put("operatorAlert", "The ambulance location is out of date. Waiting for a new location update.");
            return result;
        }
        result.put("ambulanceId", ambulance.getAmbulanceId());
        result.put("locationUpdatedAt", ambulance.getTelemetryUpdatedAt());

        double destinationLat;
        double destinationLng;
        if ("TRANSPORTING".equals(mission.getCurrentState())) {
            Hospital hospital = mission.getAssignedHospitalId() == null ? null
                    : hospitals.findById(mission.getAssignedHospitalId()).orElse(null);
            if (hospital == null || hospital.getLatitude() == null || hospital.getLongitude() == null) {
                result.put("routeAvailable", false);
                result.put("status", "HOSPITAL_DESTINATION_PENDING");
                result.put("operatorAlert", "A confirmed hospital destination is required before routing.");
                return result;
            }
            destinationLat = hospital.getLatitude();
            destinationLng = hospital.getLongitude();
            result.put("destinationLabel", hospital.getName());
        } else {
            IncidentLocation location = locations.findByEmergencyId(mission.getEmergencyId()).orElse(null);
            Double lat = location == null ? null : location.getConfirmedLat() != null ? location.getConfirmedLat() : location.getCallerLat();
            Double lng = location == null ? null : location.getConfirmedLng() != null ? location.getConfirmedLng() : location.getCallerLng();
            if (lat == null || lng == null) {
                result.put("routeAvailable", false);
                result.put("status", "LOCATION_CONFIRMATION_NEEDED");
                result.put("operatorAlert", "The patient location must be shared before a route can be calculated.");
                return result;
            }
            destinationLat = lat;
            destinationLng = lng;
            result.put("destinationLabel", location.getConfirmedAddress() == null ? "Patient location" : location.getConfirmedAddress());
            result.put("locationConfirmed", location.getConfirmedLat() != null && location.getConfirmedLng() != null);
            result.put("locationAccuracyMeters", location.getCallerAccuracyMeters());
        }

        Map<String, Object> route = routing.calculateRoute(missionId, String.valueOf(result.get("leg")),
                ambulance.getLatitude(), ambulance.getLongitude(), destinationLat, destinationLng);
        result.putAll(route);
        if (Boolean.TRUE.equals(route.get("routeAvailable"))) {
            Double eta = (Double) route.get("estimatedDurationMins");
            if ("TO_HOSPITAL".equals(result.get("leg"))) mission.setHospitalEtaMins(eta);
            else mission.setPickupEtaMins(eta);
            missions.save(mission);
        }
        return result;
    }
}
