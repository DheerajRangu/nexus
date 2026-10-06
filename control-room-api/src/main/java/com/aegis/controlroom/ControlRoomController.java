package com.aegis.controlroom;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/control-room")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class ControlRoomController {
  private final Object lock = new Object();
  private final Random random = new Random();
  private final List<Ambulance> ambulances = new ArrayList<>();
  private final List<Incident> incidents = new ArrayList<>();
  private final List<HospitalStatus> hospitals = new ArrayList<>();
  private final List<OperationalLog> logs = new ArrayList<>();

  public ControlRoomController() {
    resetState();
  }

  @GetMapping("/snapshot")
  public CommandSnapshot snapshot() {
    synchronized (lock) {
      return current();
    }
  }

  @PostMapping("/reset")
  public CommandSnapshot reset() {
    synchronized (lock) {
      resetState();
      addLog("DEMO RESET - AEGIS control room restored to initial state");
      return current();
    }
  }

  @PostMapping("/tick")
  public CommandSnapshot tick() {
    synchronized (lock) {
      simulateLiveUpdate();
      return current();
    }
  }

  @PostMapping("/assign")
  public CommandSnapshot assign() {
    synchronized (lock) {
      var available = ambulances.stream().filter(a -> "available".equals(a.status())).findFirst();
      var unassigned = incidents.stream().filter(i -> i.assigned() == null).findFirst();
      if (available.isPresent() && unassigned.isPresent()) {
        var ambulance = available.get();
        var incident = unassigned.get();
        replaceAmbulance(ambulance.withAssignment(incident.id(), "enroute", random.nextInt(8) + 2, hospitals.get(random.nextInt(hospitals.size())).name()));
        replaceIncident(incident.withAssigned(ambulance.id()));
        addLog(ambulance.id() + " assigned to " + incident.id());
      } else {
        addLog("No available ambulance or unassigned incident for manual assignment");
      }
      return current();
    }
  }

  private void resetState() {
    ambulances.clear();
    incidents.clear();
    hospitals.clear();
    logs.clear();
    ambulances.add(new Ambulance("AMB-01", "Sarah Chen", "enroute", "INC-102", 40.7128, -74.0060, 4, "St. Mary"));
    ambulances.add(new Ambulance("AMB-02", "James Okonkwo", "available", null, 40.7215, -73.9951, null, null));
    ambulances.add(new Ambulance("AMB-03", "Marta Kowalski", "on-scene", "INC-101", 40.7350, -73.9900, 0, "Metro General"));
    ambulances.add(new Ambulance("AMB-04", "David Park", "enroute", "INC-103", 40.7010, -74.0120, 7, "University"));
    ambulances.add(new Ambulance("AMB-05", "Aisha Rahman", "available", null, 40.7450, -73.9800, null, null));
    incidents.add(new Incident("INC-101", "Cardiac", "Fifth Ave & 32nd", "critical", "TRK-8821", "AMB-03"));
    incidents.add(new Incident("INC-102", "Traffic Accident", "I-95 Exit 14", "high", "TRK-4190", "AMB-01"));
    incidents.add(new Incident("INC-103", "Fall Injury", "Central Park West", "medium", "TRK-7732", "AMB-04"));
    incidents.add(new Incident("INC-104", "Respiratory", "Brooklyn Bridge", "high", "TRK-5523", null));
    hospitals.add(new HospitalStatus("H-01", "St. Mary Medical", 78, 12, "Level I", "Downtown"));
    hospitals.add(new HospitalStatus("H-02", "Metro General", 92, 4, "Level II", "Midtown"));
    hospitals.add(new HospitalStatus("H-03", "University Hospital", 65, 23, "Level I", "North"));
    hospitals.add(new HospitalStatus("H-04", "Riverside Medical", 43, 31, "Level III", "West"));
    addLog("AMB-01 assigned to INC-102");
    addLog("Citizen TRK-4190 linked to incident INC-102");
    addLog("AMB-03 arrived on scene INC-101");
    addLog("Hospital Metro General updated capacity");
    addLog("AEGIS backend started - all services healthy");
  }

  private void simulateLiveUpdate() {
    var moving = ambulances.stream().filter(a -> "enroute".equals(a.status()) && a.eta() != null && a.eta() > 1).findAny();
    moving.ifPresentOrElse(ambulance -> {
      var updated = ambulance.withPosition(ambulance.lat() + ((random.nextDouble() - 0.5) * 0.002), ambulance.lng() + ((random.nextDouble() - 0.5) * 0.002), ambulance.eta() - 1);
      replaceAmbulance(updated);
      addLog(updated.id() + " ETA updated to " + updated.eta() + " min");
    }, this::tryAssignAvailable);

    var hospital = hospitals.get(random.nextInt(hospitals.size()));
    var capacity = Math.min(98, Math.max(20, hospital.capacity() + random.nextInt(9) - 4));
    replaceHospital(new HospitalStatus(hospital.id(), hospital.name(), capacity, Math.max(0, (100 - capacity) / 2), hospital.trauma(), hospital.location()));
    if (random.nextDouble() < 0.2 && incidents.size() < 8) {
      var id = "INC-" + (random.nextInt(900) + 200);
      incidents.add(new Incident(id, List.of("Stroke", "Burn", "Respiratory", "Traffic Accident").get(random.nextInt(4)),
          List.of("Broadway & 42nd", "Holland Tunnel", "Wall Street", "Times Square").get(random.nextInt(4)),
          List.of("critical", "high", "medium").get(random.nextInt(3)),
          "TRK-" + (random.nextInt(9000) + 1000), null));
      addLog("New incident " + id + " reported");
    }
  }

  private void tryAssignAvailable() {
    var available = ambulances.stream().filter(a -> "available".equals(a.status())).findFirst();
    var unassigned = incidents.stream().filter(i -> i.assigned() == null).findFirst();
    if (available.isPresent() && unassigned.isPresent()) {
      var ambulance = available.get();
      var incident = unassigned.get();
      replaceAmbulance(ambulance.withAssignment(incident.id(), "enroute", random.nextInt(8) + 2, hospitals.get(random.nextInt(hospitals.size())).name()));
      replaceIncident(incident.withAssigned(ambulance.id()));
      addLog(ambulance.id() + " assigned to " + incident.id());
    } else {
      addLog("AEGIS sync - operational status nominal");
    }
  }

  private void replaceAmbulance(Ambulance updated) {
    for (int i = 0; i < ambulances.size(); i++) {
      if (ambulances.get(i).id().equals(updated.id())) {
        ambulances.set(i, updated);
        return;
      }
    }
  }

  private void replaceIncident(Incident updated) {
    for (int i = 0; i < incidents.size(); i++) {
      if (incidents.get(i).id().equals(updated.id())) {
        incidents.set(i, updated);
        return;
      }
    }
  }

  private void replaceHospital(HospitalStatus updated) {
    for (int i = 0; i < hospitals.size(); i++) {
      if (hospitals.get(i).id().equals(updated.id())) {
        hospitals.set(i, updated);
        return;
      }
    }
  }

  private CommandSnapshot current() {
    return new CommandSnapshot(List.copyOf(ambulances), List.copyOf(incidents), List.copyOf(hospitals), List.copyOf(logs), Map.of(
        "availableAmbulances", ambulances.stream().filter(a -> "available".equals(a.status())).count(),
        "openIncidents", (long) incidents.size(),
        "criticalIncidents", incidents.stream().filter(i -> "critical".equals(i.priority())).count()));
  }

  private void addLog(String message) {
    logs.add(0, new OperationalLog(LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss")), message));
    if (logs.size() > 30) {
      logs.remove(logs.size() - 1);
    }
  }

  public record CommandSnapshot(List<Ambulance> ambulances, List<Incident> incidents, List<HospitalStatus> hospitals,
      List<OperationalLog> logs, Map<String, Long> metrics) {}

  public record Ambulance(String id, String driver, String status, String incident, double lat, double lng, Integer eta, String hospital) {
    Ambulance withPosition(double nextLat, double nextLng, Integer nextEta) {
      return new Ambulance(id, driver, status, incident, nextLat, nextLng, nextEta, hospital);
    }

    Ambulance withAssignment(String nextIncident, String nextStatus, Integer nextEta, String nextHospital) {
      return new Ambulance(id, driver, nextStatus, nextIncident, lat, lng, nextEta, nextHospital);
    }
  }

  public record Incident(String id, String type, String location, String priority, String citizen, String assigned) {
    Incident withAssigned(String ambulanceId) {
      return new Incident(id, type, location, priority, citizen, ambulanceId);
    }
  }

  public record HospitalStatus(String id, String name, int capacity, int beds, String trauma, String location) {}

  public record OperationalLog(String time, String msg) {}
}
