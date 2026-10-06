package com.aegis.hospital;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/hospital")
@CrossOrigin(origins = {"http://localhost:5174", "http://127.0.0.1:5174"})
public class HospitalController {
  private final Object lock = new Object();
  private HospitalProfile profile;
  private final Map<String, BedUnit> beds = new LinkedHashMap<>();
  private final Map<String, Equipment> equipment = new LinkedHashMap<>();
  private final Map<String, Theatre> theatres = new LinkedHashMap<>();
  private final Map<String, Specialist> specialists = new LinkedHashMap<>();
  private final Map<String, IncomingRequest> requests = new LinkedHashMap<>();
  private final Map<String, Reservation> reservations = new LinkedHashMap<>();
  private final Map<String, Arrival> arrivals = new LinkedHashMap<>();
  private final List<EventLog> history = new ArrayList<>();
  private final List<EventLog> audit = new ArrayList<>();
  private int sequence = 1000;

  public HospitalController() {
    reset();
  }

  @GetMapping("/overview")
  public HospitalSnapshot overview() {
    synchronized (lock) {
      return snapshot();
    }
  }

  @PostMapping("/reset")
  public HospitalSnapshot resetDemo() {
    synchronized (lock) {
      reset();
      return snapshot();
    }
  }

  @PutMapping("/profile")
  public HospitalSnapshot updateProfile(@Valid @RequestBody ProfileUpdate request) {
    synchronized (lock) {
      profile = new HospitalProfile(
          profile.id(),
          request.name(),
          profile.mainLat(),
          profile.mainLng(),
          profile.ambulanceEntranceLat(),
          profile.ambulanceEntranceLng(),
          request.entranceInstructions(),
          profile.phone(),
          profile.capabilities(),
          profile.specialties(),
          request.operatingStatus(),
          request.acceptanceRestrictions(),
          profile.version() + 1,
          Instant.now());
      log("PROFILE_UPDATED", "Hospital profile updated", profile.name());
      return snapshot();
    }
  }

  @PutMapping("/beds/{id}")
  public HospitalSnapshot updateBed(@PathVariable String id, @Valid @RequestBody BedUpdate request) {
    synchronized (lock) {
      var bed = require(beds, id, "Bed unit not found.");
      int committed = bed.reserved() + request.occupied() + request.unavailable();
      if (committed > request.total()) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Total capacity cannot be lower than occupied + reserved + unavailable.");
      }
      beds.put(id, new BedUnit(
          bed.id(), bed.kind(), bed.label(), request.total(),
          request.total() - committed,
          bed.reserved(), request.occupied(), request.unavailable(),
          bed.hasVentilator(), bed.hasMonitor(), Instant.now(), "Hospital staff", bed.version() + 1));
      log("BED_UPDATED", bed.label() + " inventory updated", id);
      return snapshot();
    }
  }

  @PutMapping("/equipment/{id}")
  public HospitalSnapshot updateEquipment(@PathVariable String id, @Valid @RequestBody EquipmentUpdate request) {
    synchronized (lock) {
      var item = require(equipment, id, "Equipment not found.");
      int committed = item.reserved() + request.inUse() + request.unavailable();
      if (committed > request.total()) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Total equipment cannot be lower than in-use + reserved + unavailable.");
      }
      equipment.put(id, new Equipment(
          item.id(), item.kind(), item.label(), request.total(),
          request.total() - committed,
          item.reserved(), request.inUse(), request.unavailable(),
          Instant.now(), "Hospital staff", item.version() + 1));
      log("EQUIPMENT_UPDATED", item.label() + " inventory updated", id);
      return snapshot();
    }
  }

  @PutMapping("/specialists/{id}")
  public HospitalSnapshot updateSpecialist(@PathVariable String id, @Valid @RequestBody SpecialistUpdate request) {
    synchronized (lock) {
      var current = require(specialists, id, "Specialist not found.");
      specialists.put(id, new Specialist(
          current.id(), current.specialty(), current.displayName(), request.status(),
          request.readinessEtaMinutes(), Instant.now(), "Hospital staff", Instant.now(), current.version() + 1));
      log("SPECIALIST_UPDATED", current.specialty() + " status changed to " + request.status(), id);
      return snapshot();
    }
  }

  @PostMapping("/requests/{id}/accept")
  public HospitalSnapshot accept(@PathVariable String id, @Valid @RequestBody AcceptRequest request) {
    synchronized (lock) {
      var incoming = require(requests, id, "Request not found.");
      if (!"OPEN".equals(incoming.status())) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Request is no longer open.");
      }
      var bed = require(beds, request.bedUnitId(), "Selected bed unit not found.");
      if (bed.available() < 1) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Selected bed unit has no availability.");
      }
      var selectedEquipment = request.equipmentIds().stream()
          .map(equipmentId -> require(equipment, equipmentId, "Selected equipment not found."))
          .toList();
      selectedEquipment.forEach(item -> {
        if (item.available() < 1) {
          throw new ResponseStatusException(HttpStatus.CONFLICT, item.label() + " has no availability.");
        }
      });

      beds.put(bed.id(), new BedUnit(bed.id(), bed.kind(), bed.label(), bed.total(), bed.available() - 1, bed.reserved() + 1,
          bed.occupied(), bed.unavailable(), bed.hasVentilator(), bed.hasMonitor(), Instant.now(), "Reservation", bed.version() + 1));
      selectedEquipment.forEach(item -> equipment.put(item.id(), new Equipment(item.id(), item.kind(), item.label(), item.total(),
          item.available() - 1, item.reserved() + 1, item.inUse(), item.unavailable(), Instant.now(), "Reservation", item.version() + 1)));

      var accepted = incoming.withStatus("ACCEPTED");
      requests.put(id, accepted);
      var reservation = new Reservation(UUID.randomUUID().toString(), incoming.missionRef(), bed.id(),
          selectedEquipment.stream().map(Equipment::id).toList(), Instant.now(), Instant.now().plusSeconds(900), "ACTIVE");
      reservations.put(reservation.id(), reservation);
      arrivals.put(incoming.missionRef(), new Arrival(incoming.missionRef(), incoming.ambulanceCallsign(), incoming.etaSeconds(), "INBOUND",
          List.of("Identity confirmed", "Bed assigned", "Team notified"), Instant.now()));
      log("REQUEST_ACCEPTED", incoming.missionRef() + " accepted and resources reserved", incoming.missionRef());
      return snapshot();
    }
  }

  @PostMapping("/requests/{id}/decline")
  public HospitalSnapshot decline(@PathVariable String id, @Valid @RequestBody DeclineRequest request) {
    synchronized (lock) {
      var incoming = require(requests, id, "Request not found.");
      if (!"OPEN".equals(incoming.status())) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Request is no longer open.");
      }
      requests.put(id, incoming.withStatus("DECLINED"));
      log("REQUEST_DECLINED", incoming.missionRef() + " declined: " + request.reason(), incoming.missionRef());
      return snapshot();
    }
  }

  @PostMapping("/requests/{id}/clarify")
  public HospitalSnapshot clarify(@PathVariable String id, @Valid @RequestBody ClarifyRequest request) {
    synchronized (lock) {
      var incoming = require(requests, id, "Request not found.");
      requests.put(id, incoming.withStatus("CLARIFICATION_REQUESTED"));
      log("CLARIFICATION_REQUESTED", incoming.missionRef() + ": " + request.question(), incoming.missionRef());
      return snapshot();
    }
  }

  @PostMapping("/arrivals/{missionRef}/handover")
  public HospitalSnapshot handover(@PathVariable String missionRef) {
    synchronized (lock) {
      var arrival = require(arrivals, missionRef, "Arrival not found.");
      if ("HANDOVER_COMPLETE".equals(arrival.status())) {
        return snapshot();
      }
      arrivals.put(missionRef, new Arrival(arrival.missionRef(), arrival.ambulanceCallsign(), 0, "HANDOVER_COMPLETE",
          arrival.checklist(), Instant.now()));
      reservations.values().stream()
          .filter(reservation -> reservation.missionRef().equals(missionRef))
          .findFirst()
          .ifPresent(this::occupyReservedResources);
      log("HANDOVER_COMPLETE", missionRef + " handover completed", missionRef);
      return snapshot();
    }
  }

  private void reset() {
    beds.clear();
    equipment.clear();
    theatres.clear();
    specialists.clear();
    requests.clear();
    reservations.clear();
    arrivals.clear();
    history.clear();
    audit.clear();
    sequence = 1000;
    profile = new HospitalProfile("hosp-1", "St. Mercy General", 37.7749, -122.4194, 37.7756, -122.4181,
        "Ambulance bay off Mission St, use lane B. Call ER desk on arrival.", "+1 415 555 0100",
        List.of("24/7 ER", "Trauma Level I", "Cardiac cath lab", "Stroke center"),
        List.of("Cardiac", "Trauma", "Neurology", "Pediatrics"),
        "OPERATIONAL", "No pediatric ICU transfer", 1, Instant.now());
    beds.put("bed-general", new BedUnit("bed-general", "GENERAL", "General ward", 60, 38, 4, 18, 0, false, true, Instant.now(), "Dana Rivera", 3));
    beds.put("bed-emergency", new BedUnit("bed-emergency", "EMERGENCY", "Emergency bays", 12, 3, 2, 7, 0, true, true, Instant.now(), "Sam Okafor", 4));
    beds.put("bed-icu", new BedUnit("bed-icu", "ICU", "ICU beds (vented)", 10, 2, 1, 7, 0, true, true, Instant.now(), "Dana Rivera", 2));
    equipment.put("eq-vent", new Equipment("eq-vent", "VENTILATOR", "Ventilators", 14, 4, 2, 8, 0, Instant.now(), "Dana Rivera", 2));
    equipment.put("eq-mon", new Equipment("eq-mon", "MONITOR", "Cardiac monitors", 22, 9, 2, 11, 0, Instant.now(), "Sam Okafor", 1));
    equipment.put("eq-ct", new Equipment("eq-ct", "CT", "CT scanner", 1, 1, 0, 0, 0, Instant.now(), "Sam Okafor", 1));
    equipment.put("eq-mri", new Equipment("eq-mri", "MRI", "MRI", 1, 0, 0, 1, 0, Instant.now(), "Sam Okafor", 1));
    theatres.put("th-1", new Theatre("th-1", "Theatre 1", "READY", Instant.now(), "Sam Okafor", 1));
    theatres.put("th-2", new Theatre("th-2", "Theatre 2", "IN_USE", Instant.now(), "Dana Rivera", 2));
    theatres.put("th-3", new Theatre("th-3", "Theatre 3", "CLEANING", Instant.now(), "Sam Okafor", 1));
    specialists.put("sp-cardio", new Specialist("sp-cardio", "Cardiology", "Dr. Mehta", "ON_DUTY", 0, Instant.now(), "Dana Rivera", Instant.now(), 2));
    specialists.put("sp-trauma", new Specialist("sp-trauma", "Trauma surgery", "Dr. Nkemelu", "CONTACTED", 15, Instant.now(), "Dana Rivera", Instant.now(), 1));
    specialists.put("sp-neuro", new Specialist("sp-neuro", "Neurology", "Dr. Rossi", "ON_CALL", 25, Instant.now(), "Sam Okafor", Instant.now(), 1));
    specialists.put("sp-peds", new Specialist("sp-peds", "Pediatrics", "", "UNKNOWN", null, null, "System", Instant.now(), 0));
    seedRequest("cardiac", 4, "MEDIC-1", List.of("Cardiac monitoring", "ECG on arrival"), List.of("EMERGENCY_BED", "MONITOR"));
    seedRequest("trauma", 5, "MEDIC-2", List.of("Trauma team", "Blood products"), List.of("ICU_BED", "VENTILATOR"));
    seedRequest("stroke", 5, "MEDIC-3", List.of("CT priority", "Neurology consult"), List.of("EMERGENCY_BED", "CT"));
    log("DEMO_RESET", "Hospital scenario reset", profile.id());
  }

  private void seedRequest(String category, int severity, String ambulance, List<String> requirements, List<String> resources) {
    var id = UUID.randomUUID().toString();
    var missionRef = "AEG-2026-" + (++sequence);
    requests.put(id, new IncomingRequest(id, missionRef, "CASE-" + sequence, ambulance, 240 + ((sequence - 1000) * 90),
        Instant.now(), List.of("Vitals transmitted", "Patient identity pending", "Crew ETA updating"),
        requirements, resources, "OPEN", Instant.now().plusSeconds(600), "Dana Rivera", severity, category));
    log("REQUEST_RECEIVED", "New " + category + " request " + missionRef, missionRef);
  }

  private HospitalSnapshot snapshot() {
    return new HospitalSnapshot(profile, List.copyOf(beds.values()), List.copyOf(equipment.values()), List.copyOf(theatres.values()),
        List.copyOf(specialists.values()), sortRequests(), List.copyOf(reservations.values()), List.copyOf(arrivals.values()),
        List.copyOf(history), List.copyOf(audit));
  }

  private List<IncomingRequest> sortRequests() {
    return requests.values().stream()
        .sorted(Comparator.comparing(IncomingRequest::severity).reversed().thenComparing(IncomingRequest::missionRef))
        .toList();
  }

  private void occupyReservedResources(Reservation reservation) {
    var bed = beds.get(reservation.bedUnitId());
    if (bed != null && bed.reserved() > 0) {
      beds.put(bed.id(), new BedUnit(bed.id(), bed.kind(), bed.label(), bed.total(), bed.available(), bed.reserved() - 1,
          bed.occupied() + 1, bed.unavailable(), bed.hasVentilator(), bed.hasMonitor(), Instant.now(), "Handover", bed.version() + 1));
    }
    reservation.equipmentIds().forEach(id -> {
      var item = equipment.get(id);
      if (item != null && item.reserved() > 0) {
        equipment.put(id, new Equipment(item.id(), item.kind(), item.label(), item.total(), item.available(),
            item.reserved() - 1, item.inUse() + 1, item.unavailable(), Instant.now(), "Handover", item.version() + 1));
      }
    });
    reservations.put(reservation.id(), new Reservation(reservation.id(), reservation.missionRef(), reservation.bedUnitId(),
        reservation.equipmentIds(), reservation.createdAt(), reservation.expiresAt(), "OCCUPIED"));
  }

  private <T> T require(Map<String, T> source, String key, String message) {
    var value = source.get(key);
    if (value == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
    return value;
  }

  private void log(String type, String summary, String target) {
    var event = new EventLog(UUID.randomUUID().toString(), Instant.now(), type, summary, target, "Hospital staff");
    history.add(0, event);
    audit.add(0, event);
  }

  public record HospitalSnapshot(
      HospitalProfile profile,
      List<BedUnit> beds,
      List<Equipment> equipment,
      List<Theatre> theatres,
      List<Specialist> specialists,
      List<IncomingRequest> requests,
      List<Reservation> reservations,
      List<Arrival> arrivals,
      List<EventLog> history,
      List<EventLog> audit) {}

  public record HospitalProfile(String id, String name, double mainLat, double mainLng, double ambulanceEntranceLat,
      double ambulanceEntranceLng, String entranceInstructions, String phone, List<String> capabilities,
      List<String> specialties, String operatingStatus, String acceptanceRestrictions, int version, Instant updatedAt) {}

  public record BedUnit(String id, String kind, String label, int total, int available, int reserved, int occupied,
      int unavailable, boolean hasVentilator, boolean hasMonitor, Instant updatedAt, String updatedBy, int version) {}

  public record Equipment(String id, String kind, String label, int total, int available, int reserved, int inUse,
      int unavailable, Instant updatedAt, String updatedBy, int version) {}

  public record Theatre(String id, String label, String status, Instant updatedAt, String updatedBy, int version) {}

  public record Specialist(String id, String specialty, String displayName, String status, Integer readinessEtaMinutes,
      Instant confirmedAt, String updatedBy, Instant updatedAt, int version) {}

  public record IncomingRequest(String id, String missionRef, String caseRef, String ambulanceCallsign, int etaSeconds,
      Instant lastUpdateAt, List<String> observations, List<String> confirmedRequirements, List<String> requestedResources,
      String status, Instant expiresAt, String controlRoomContact, int severity, String category) {
    IncomingRequest withStatus(String nextStatus) {
      return new IncomingRequest(id, missionRef, caseRef, ambulanceCallsign, etaSeconds, Instant.now(), observations,
          confirmedRequirements, requestedResources, nextStatus, expiresAt, controlRoomContact, severity, category);
    }
  }

  public record Reservation(String id, String missionRef, String bedUnitId, List<String> equipmentIds, Instant createdAt,
      Instant expiresAt, String status) {}

  public record Arrival(String missionRef, String ambulanceCallsign, int etaSeconds, String status, List<String> checklist,
      Instant updatedAt) {}

  public record EventLog(String id, Instant at, String type, String summary, String target, String actor) {}

  public record ProfileUpdate(String name, String operatingStatus, String entranceInstructions, String acceptanceRestrictions) {}

  public record BedUpdate(@Min(0) int total, @Min(0) int occupied, @Min(0) int unavailable) {}

  public record EquipmentUpdate(@Min(0) int total, @Min(0) int inUse, @Min(0) int unavailable) {}

  public record SpecialistUpdate(String status, Integer readinessEtaMinutes) {}

  public record AcceptRequest(String bedUnitId, List<String> equipmentIds) {
    public AcceptRequest {
      equipmentIds = equipmentIds == null ? List.of() : List.copyOf(equipmentIds);
    }
  }

  public record DeclineRequest(String reason) {}

  public record ClarifyRequest(String question) {}
}
