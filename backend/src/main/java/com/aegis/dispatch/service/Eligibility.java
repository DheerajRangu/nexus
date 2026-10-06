package com.aegis.dispatch.service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/** Deterministic operational eligibility. Clinical requirements are input only; no diagnosis occurs here. */
public final class Eligibility {
  private Eligibility() {}
  public record Vehicle(String status,boolean activeShift,boolean vehicleReady,boolean equipmentReady,boolean crewReady,boolean maintenanceRestricted,int capacity,Set<String> equipment,Set<String> crew,Instant capturedAt) {}
  public record Requirement(Set<String> equipment,Set<String> crew,int capacity) {}
  public static List<String> exclusions(Vehicle vehicle,Requirement requirement,Instant now,Duration staleAfter){
    var reasons=new ArrayList<String>();
    if(!vehicle.activeShift())reasons.add("Driver is not on an active shift");
    if(!"AVAILABLE".equals(vehicle.status()))reasons.add("Vehicle is "+vehicle.status().toLowerCase(Locale.ROOT));
    if(!vehicle.vehicleReady())reasons.add("Vehicle readiness is not confirmed");
    if(!vehicle.equipmentReady())reasons.add("Equipment readiness is not confirmed");
    if(!vehicle.crewReady())reasons.add("Crew readiness is not confirmed");
    if(vehicle.maintenanceRestricted())reasons.add("Maintenance restriction is active");
    if(vehicle.capturedAt()==null || vehicle.capturedAt().isBefore(now.minus(staleAfter)))reasons.add("Location telemetry is stale or unavailable");
    if(vehicle.capacity()<requirement.capacity())reasons.add("Insufficient patient transport capacity");
    var equipment=new TreeSet<>(requirement.equipment()); equipment.removeAll(vehicle.equipment()); if(!equipment.isEmpty())reasons.add("Missing equipment: "+String.join(", ",equipment));
    var crew=new TreeSet<>(requirement.crew()); crew.removeAll(vehicle.crew()); if(!crew.isEmpty())reasons.add("Missing crew capability: "+String.join(", ",crew));
    return List.copyOf(reasons);
  }
}
