import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CONTRACT_VERSION,
  type Lang,
  type Assignment,
  type DemoStep,
  type EventType,
  type GeoPoint,
  type Hospital,
  type LocationAlerts,
  type LocationConfirmationRequest,
  type LocationConfirmationResponse,
  type LocationSource,
  type ReporterRole,
  type RoutePath,
  type Telemetry,
  type TrackingEvent,
  type TrackingPhase,
  type TrackingSnapshot,
  type EntityName,
} from "../shared/contract";
import { explain, type ExplanationKey } from "./explanations";

const DUMMY_HASH = sha256("aegis-citizen-dummy-token");

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface AdapterDeps {
  now: () => number;
  mode: "development" | "proxy";
  controlRoomPhone: string;
  driverRelayPhone: string;
  tokenTtlMs: number;
  sessionTtlMs: number;
  activeAccessTtlMs: number;
  terminalAccessTtlMs: number;
  staleAfterSeconds: number;
}

interface PickupRecord {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  observedAt: string;
  source: LocationSource;
  addressFormatted: string | null;
  notes: LocationConfirmationRequest["notes"];
  role: ReporterRole;
  confirmedAt: string;
}

interface EmergencyRecord {
  emergencyId: string;
  missionId: string | null;
  missionReference: string;
  synthetic: true;
  autoplay: boolean;
  phase: TrackingPhase;
  explanationKey: ExplanationKey;
  dispatchDelayed: boolean;
  accessExpiresAt: number;
  terminalAt: number | null;
  createdAt: number;
  updatedAt: number;
  stateVersion: number;
  versions: TrackingSnapshot["versions"];
  sequence: number;
  pickup: PickupRecord | null;
  deviceHint: LocationConfirmationRequest["deviceObservation"];
  assignment: Assignment | null;
  spareAmbulance: Assignment;
  telemetry: Omit<Telemetry, "stale"> | null;
  forcedStale: boolean;
  route: RoutePath | null;
  routeCursor: number;
  hospital: Hospital | null;
  alternateHospital: Hospital;
  correction: TrackingSnapshot["location"]["correction"];
  events: TrackingEvent[];
  idempotency: Map<string, { fingerprint: string; response: LocationConfirmationResponse }>;
  timer: ReturnType<typeof setTimeout> | null;
}

interface TokenRecord {
  hash: string;
  emergencyId: string;
  expiresAt: number;
  revoked: boolean;
}

interface SessionRecord {
  hash: string;
  emergencyId: string;
  expiresAt: number;
}

const PLACES: Array<GeoPoint & { label: string }> = [
  { label: "Demonstration Junction", latitude: 17.3854, longitude: 78.4868 },
  { label: "Demonstration Apartments, gate 2", latitude: 17.3912, longitude: 78.4785 },
  { label: "Demonstration Bus Stop", latitude: 17.3788, longitude: 78.4922 },
  { label: "Demo General Hospital entrance", latitude: 17.3725, longitude: 78.5011 },
];

const HOSPITAL_A: Hospital = {
  hospitalId: "hosp_demo_general",
  name: "Demo General Hospital",
  confirmed: true,
  latitude: 17.3725,
  longitude: 78.5011,
};

const HOSPITAL_B: Hospital = {
  hospitalId: "hosp_demo_south",
  name: "Demo South Hospital",
  confirmed: true,
  latitude: 17.3611,
  longitude: 78.4744,
};

export class DevelopmentStore {
  private emergencies = new Map<string, EmergencyRecord>();
  private tokens = new Map<string, TokenRecord>();
  private sessions = new Map<string, SessionRecord>();
  private listeners = new Set<(event: TrackingEvent) => void>();

  constructor(private deps: AdapterDeps) {}

  stop(): void {
    for (const record of this.emergencies.values()) {
      if (record.timer) clearTimeout(record.timer);
    }
  }

  subscribe(listener: (event: TrackingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  issueToken(options?: { ttlMs?: number; autoplay?: boolean }): { token: string; emergencyId: string } {
    const token = randomBytes(32).toString("base64url");
    const hash = sha256(token);
    const now = this.deps.now();
    const emergency = this.createEmergency(options?.autoplay === true);
    const ttl = options?.ttlMs ?? this.deps.tokenTtlMs;
    this.tokens.set(hash, {
      hash,
      emergencyId: emergency.emergencyId,
      expiresAt: now + ttl,
      revoked: false,
    });
    return { token, emergencyId: emergency.emergencyId };
  }

  revokeToken(token: string): void {
    const record = this.tokens.get(sha256(token));
    if (record) record.revoked = true;
  }

  openSession(token: string): { secret: string; expiresAt: string; emergencyId: string } {
    const presented = sha256(token);
    const record = this.tokens.get(presented);
    const known = record?.hash ?? DUMMY_HASH;
    const presentedBuf = Buffer.from(presented);
    const knownBuf = Buffer.from(known);
    const match = presentedBuf.length === knownBuf.length && timingSafeEqual(presentedBuf, knownBuf);
    if (!record || !match) {
      throw new HttpError(401, "TOKEN_INVALID", "This tracking link is not valid.");
    }
    const now = this.deps.now();
    if (record.revoked) {
      throw new HttpError(401, "TOKEN_REVOKED", "This tracking link is no longer available.");
    }
    if (record.expiresAt <= now) {
      throw new HttpError(401, "TOKEN_EXPIRED", "This tracking link has expired.");
    }
    const emergency = this.emergencies.get(record.emergencyId);
    if (!emergency || emergency.accessExpiresAt <= now) {
      throw new HttpError(401, "TOKEN_EXPIRED", "This tracking link has expired.");
    }
    const secret = randomBytes(32).toString("base64url");
    const expiresAt = Math.min(now + this.deps.sessionTtlMs, emergency.accessExpiresAt);
    this.sessions.set(sha256(secret), {
      hash: sha256(secret),
      emergencyId: emergency.emergencyId,
      expiresAt,
    });
    return { secret, expiresAt: new Date(expiresAt).toISOString(), emergencyId: emergency.emergencyId };
  }

  requireSession(secret: string | null, requestedEmergencyId?: string | null): EmergencyRecord {
    if (!secret) throw new HttpError(401, "SESSION_REQUIRED", "Open the secure link from your SMS.");
    const session = this.sessions.get(sha256(secret));
    if (!session) throw new HttpError(401, "SESSION_REQUIRED", "Open the secure link from your SMS.");
    const now = this.deps.now();
    const emergency = this.emergencies.get(session.emergencyId);
    if (session.expiresAt <= now || !emergency || emergency.accessExpiresAt <= now) {
      this.sessions.delete(sha256(secret));
      throw new HttpError(401, "SESSION_EXPIRED", "This tracking session has ended.");
    }
    if (requestedEmergencyId && requestedEmergencyId !== emergency.emergencyId) {
      throw new HttpError(403, "CROSS_MISSION_DENIED", "This session cannot open another emergency.");
    }
    return emergency;
  }

  snapshot(emergency: EmergencyRecord, lang: Lang): TrackingSnapshot {
    return this.buildSnapshot(emergency, lang);
  }

  eventsAfter(emergency: EmergencyRecord, lastSequence: number): TrackingEvent[] {
    return emergency.events.filter((event) => event.sequence > lastSequence);
  }

  confirmLocation(emergency: EmergencyRecord, body: LocationConfirmationRequest, lang: Lang): LocationConfirmationResponse {
    if (emergency.phase === "COMPLETED" || emergency.phase === "CANCELLED") {
      throw new HttpError(409, "LOCATION_CLOSED", "This request is no longer accepting a location.");
    }
    const parsed = parseLocation(body);
    const fingerprint = sha256(JSON.stringify(parsed));
    const existing = emergency.idempotency.get(parsed.clientSubmissionId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "This submission id was already used.");
      }
      return existing.response;
    }
    if (parsed.expectedLocationVersion !== emergency.versions.location) {
      throw new HttpError(409, "VERSION_CONFLICT", "The location changed. Refresh and confirm again.", {
        locationVersion: emergency.versions.location,
      });
    }
    const hadPickup = emergency.pickup !== null;
    const hadAssignment = emergency.assignment !== null;
    const hospitalId = emergency.hospital?.hospitalId ?? null;
    emergency.deviceHint = parsed.deviceObservation;
    emergency.pickup = {
      ...parsed.pickup,
      addressFormatted: parsed.addressFormatted,
      notes: parsed.notes,
      role: parsed.role,
      confirmedAt: new Date(this.deps.now()).toISOString(),
    };
    const alerts: LocationAlerts = {
      controlRoom: hadPickup,
      driver: hadPickup && hadAssignment,
      hospitalChanged: false,
    };
    if (hadPickup) {
      emergency.correction = {
        alertedControlRoom: alerts.controlRoom,
        alertedDriver: alerts.driver,
        hospitalChanged: false,
        at: new Date(this.deps.now()).toISOString(),
      };
      emergency.explanationKey = "correction";
    } else {
      emergency.explanationKey = "locationConfirmed";
    }
    this.publish(emergency, "location", "location.updated");
    if ((emergency.hospital?.hospitalId ?? null) !== hospitalId) {
      throw new Error("Hospital destination changed during a pickup update.");
    }
    const response: LocationConfirmationResponse = {
      contractVersion: CONTRACT_VERSION,
      tracking: this.buildSnapshot(emergency, lang),
      alerts,
    };
    emergency.idempotency.set(parsed.clientSubmissionId, { fingerprint, response });
    if (!hadPickup && emergency.autoplay) this.scheduleAutoplay(emergency);
    return response;
  }

  applyDemoStep(emergency: EmergencyRecord, step: DemoStep, lang: Lang): TrackingSnapshot {
    if (!emergency.synthetic) {
      throw new HttpError(403, "NOT_SYNTHETIC", "Only the labelled demonstration can be stepped.");
    }
    const applied = this.transition(emergency, step);
    if (!applied) {
      throw new HttpError(409, "DEMO_STEP_UNAVAILABLE", "That demonstration step is not available yet.");
    }
    if (step === "expire_access") {
      throw new HttpError(401, "SESSION_EXPIRED", "This tracking session has ended.");
    }
    return this.buildSnapshot(emergency, lang);
  }

  searchPlaces(query: string): Array<GeoPoint & { label: string }> {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return PLACES.filter((place) => place.label.toLowerCase().includes(needle)).slice(0, 5);
  }

  reversePlace(latitude: number, longitude: number): GeoPoint & { label: string } {
    let best = PLACES[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const place of PLACES) {
      const distance = (place.latitude - latitude) ** 2 + (place.longitude - longitude) ** 2;
      if (distance < bestDistance) {
        best = place;
        bestDistance = distance;
      }
    }
    return { label: `Near ${best.label}`, latitude, longitude };
  }

  private createEmergency(autoplay: boolean): EmergencyRecord {
    const now = this.deps.now();
    const n = 1000 + Math.floor(Math.random() * 9000);
    const record: EmergencyRecord = {
      emergencyId: `emg_${randomBytes(9).toString("base64url")}`,
      missionId: null,
      missionReference: `AG-DEMO-${n}`,
      synthetic: true,
      autoplay,
      phase: "COORDINATING",
      explanationKey: "coordinating",
      dispatchDelayed: false,
      accessExpiresAt: now + this.deps.activeAccessTtlMs,
      terminalAt: null,
      createdAt: now,
      updatedAt: now,
      stateVersion: 0,
      versions: { mission: 0, assignment: 0, telemetry: 0, route: 0, hospital: 0, location: 1 },
      sequence: 0,
      pickup: null,
      deviceHint: null,
      assignment: null,
      spareAmbulance: makeAmbulance(308),
      telemetry: null,
      forcedStale: false,
      route: null,
      routeCursor: 0,
      hospital: null,
      alternateHospital: HOSPITAL_B,
      correction: null,
      events: [],
      idempotency: new Map(),
      timer: null,
    };
    this.emergencies.set(record.emergencyId, record);
    this.publish(record, "mission", "mission.updated");
    return record;
  }

  private transition(record: EmergencyRecord, step: DemoStep): boolean {
    switch (step) {
      case "delay":
        if (record.phase !== "COORDINATING") return false;
        record.dispatchDelayed = true;
        record.explanationKey = "delayed";
        this.publish(record, "mission", "mission.updated");
        return true;
      case "assign":
        if (record.phase !== "COORDINATING" || !record.pickup) return false;
        record.missionId = record.missionId ?? `msn_${randomBytes(6).toString("base64url")}`;
        record.assignment = makeAmbulance(214);
        record.phase = "AMBULANCE_ASSIGNED";
        record.dispatchDelayed = false;
        record.explanationKey = "assigned";
        record.telemetry = null;
        record.route = line(offset(record.pickup, 0.02, 0.02), record.pickup, 5, new Date(this.deps.now()).toISOString());
        record.routeCursor = 0;
        this.publish(record, "mission", "mission.updated");
        this.publish(record, "assignment", "assignment.changed");
        this.publish(record, "route", "route.updated");
        return true;
      case "telemetry": {
        if (!record.assignment || !record.route || !record.pickup) return false;
        if (record.phase === "COMPLETED" || record.phase === "CANCELLED" || record.phase === "ARRIVED_AT_HOSPITAL") {
          return false;
        }
        if (record.phase === "AMBULANCE_ASSIGNED") {
          record.phase = "AMBULANCE_APPROACHING";
          record.explanationKey = "approaching";
          this.publish(record, "mission", "mission.updated");
        }
        if (record.phase === "AMBULANCE_AT_PICKUP") return false;
        const point = record.route.points[Math.min(record.routeCursor, record.route.points.length - 1)];
        record.routeCursor += 1;
        record.forcedStale = false;
        record.telemetry = {
          ambulanceId: record.assignment.ambulanceId,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracyMeters: 18,
          observedAt: new Date(this.deps.now()).toISOString(),
          staleAfterSeconds: this.deps.staleAfterSeconds,
        };
        this.publish(record, "telemetry", "telemetry.position");
        return true;
      }
      case "at_pickup":
        if (record.phase !== "AMBULANCE_APPROACHING" || !record.pickup || !record.assignment) return false;
        record.phase = "AMBULANCE_AT_PICKUP";
        record.explanationKey = "atPickup";
        record.telemetry = {
          ambulanceId: record.assignment.ambulanceId,
          latitude: record.pickup.latitude,
          longitude: record.pickup.longitude,
          accuracyMeters: 12,
          observedAt: new Date(this.deps.now()).toISOString(),
          staleAfterSeconds: this.deps.staleAfterSeconds,
        };
        this.publish(record, "mission", "mission.updated");
        this.publish(record, "telemetry", "telemetry.position");
        return true;
      case "travel":
        if (record.phase !== "AMBULANCE_AT_PICKUP" || !record.pickup) return false;
        record.hospital = { ...HOSPITAL_A };
        record.phase = "TRAVELLING_TO_HOSPITAL";
        record.explanationKey = "travelling";
        record.route = line(record.pickup, record.hospital, 5, new Date(this.deps.now()).toISOString());
        record.routeCursor = 0;
        this.publish(record, "hospital", "hospital.changed");
        this.publish(record, "route", "route.updated");
        this.publish(record, "mission", "mission.updated");
        return true;
      case "arrive":
        if (record.phase !== "TRAVELLING_TO_HOSPITAL" || !record.hospital || !record.assignment) return false;
        record.phase = "ARRIVED_AT_HOSPITAL";
        record.explanationKey = "arrived";
        record.telemetry = {
          ambulanceId: record.assignment.ambulanceId,
          latitude: record.hospital.latitude,
          longitude: record.hospital.longitude,
          accuracyMeters: 15,
          observedAt: new Date(this.deps.now()).toISOString(),
          staleAfterSeconds: this.deps.staleAfterSeconds,
        };
        this.publish(record, "mission", "mission.updated");
        this.publish(record, "telemetry", "telemetry.position");
        return true;
      case "complete":
        if (record.phase !== "ARRIVED_AT_HOSPITAL") return false;
        this.finish(record, "COMPLETED", "completed");
        return true;
      case "cancel":
        if (record.phase === "COMPLETED" || record.phase === "CANCELLED") return false;
        this.finish(record, "CANCELLED", "cancelled");
        return true;
      case "change_assignment":
        if (!record.assignment || (record.phase !== "AMBULANCE_ASSIGNED" && record.phase !== "AMBULANCE_APPROACHING")) {
          return false;
        }
        record.assignment = record.spareAmbulance;
        record.telemetry = null;
        record.forcedStale = false;
        record.phase = "AMBULANCE_ASSIGNED";
        record.explanationKey = "assigned";
        if (record.pickup) {
          record.route = line(offset(record.pickup, -0.018, 0.015), record.pickup, 5, new Date(this.deps.now()).toISOString());
          record.routeCursor = 0;
        }
        this.publish(record, "assignment", "assignment.changed");
        this.publish(record, "telemetry", "telemetry.position");
        this.publish(record, "mission", "mission.updated");
        this.publish(record, "route", "route.updated");
        return true;
      case "change_hospital":
        if (record.phase !== "TRAVELLING_TO_HOSPITAL" || !record.pickup) return false;
        record.hospital = { ...record.alternateHospital };
        record.route = line(record.telemetry ?? record.pickup, record.hospital, 5, new Date(this.deps.now()).toISOString());
        record.routeCursor = 0;
        this.publish(record, "hospital", "hospital.changed");
        this.publish(record, "route", "route.updated");
        return true;
      case "stale_telemetry":
        if (!record.telemetry) return false;
        record.forcedStale = true;
        record.telemetry = {
          ...record.telemetry,
          observedAt: new Date(this.deps.now() - (this.deps.staleAfterSeconds + 30) * 1000).toISOString(),
        };
        this.publish(record, "telemetry", "telemetry.position");
        return true;
      case "expire_access":
        record.accessExpiresAt = this.deps.now() - 1000;
        for (const [hash, session] of this.sessions) {
          if (session.emergencyId === record.emergencyId) this.sessions.delete(hash);
        }
        this.publish(record, "session", "session.expired");
        return true;
      default:
        return false;
    }
  }

  private finish(record: EmergencyRecord, phase: "COMPLETED" | "CANCELLED", key: ExplanationKey): void {
    const now = this.deps.now();
    record.phase = phase;
    record.explanationKey = key;
    record.terminalAt = now;
    record.accessExpiresAt = now + this.deps.terminalAccessTtlMs;
    this.publish(record, "mission", "mission.updated");
  }

  private scheduleAutoplay(record: EmergencyRecord): void {
    const steps: DemoStep[] = [
      "assign",
      "telemetry",
      "telemetry",
      "telemetry",
      "at_pickup",
      "travel",
      "telemetry",
      "telemetry",
      "arrive",
      "complete",
    ];
    const run = (index: number) => {
      if (!record.autoplay || record.phase === "COMPLETED" || record.phase === "CANCELLED") return;
      const timer = setTimeout(() => {
        try {
          this.transition(record, steps[index]);
        } catch {
          /* demonstration step can be skipped if the caller already advanced */
        }
        if (index + 1 < steps.length) run(index + 1);
      }, 4000);
      timer.unref();
      record.timer = timer;
    };
    run(0);
  }

  private publish(record: EmergencyRecord, entity: EntityName | "session", type: EventType): void {
    const nowIso = new Date(this.deps.now()).toISOString();
    record.updatedAt = this.deps.now();
    record.stateVersion += 1;
    if (entity !== "session") record.versions[entity] += 1;
    record.sequence += 1;
    const version = entity === "session" ? record.stateVersion : record.versions[entity];
    const snapshot = type === "session.expired" ? null : this.buildSnapshot(record, "en");
    const event: TrackingEvent = {
      eventId: `evt_${randomBytes(8).toString("base64url")}`,
      sequence: record.sequence,
      contractVersion: CONTRACT_VERSION,
      type,
      emergencyId: record.emergencyId,
      missionId: record.missionId,
      entity,
      version,
      occurredAt: nowIso,
      snapshot,
    };
    record.events.push(event);
    if (record.events.length > 200) record.events.splice(0, record.events.length - 200);
    for (const listener of this.listeners) listener(event);
  }

  private buildSnapshot(record: EmergencyRecord, lang: Lang): TrackingSnapshot {
    const now = this.deps.now();
    const telemetry = this.visibleTelemetry(record, now);
    const terminal = record.phase === "COMPLETED" || record.phase === "CANCELLED";
    const eta = telemetry && !telemetry.stale ? this.eta(record, telemetry, now) : null;
    return {
      contractVersion: CONTRACT_VERSION,
      synthetic: true,
      emergencyId: record.emergencyId,
      missionId: record.missionId,
      missionReference: record.missionReference,
      phase: record.phase,
      statusKey: statusKey(record.phase),
      explanationKey: record.explanationKey,
      statusExplanation: explain(lang, record.explanationKey),
      dispatchDelayed: record.dispatchDelayed,
      serverTime: new Date(now).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
      accessExpiresAt: new Date(record.accessExpiresAt).toISOString(),
      lastEventId: String(record.sequence),
      stateVersion: record.stateVersion,
      versions: { ...record.versions },
      location: {
        confirmationRequired: record.pickup === null && !terminal,
        confirmedPickup: record.pickup,
        correction: record.correction,
      },
      assignment: record.assignment,
      telemetry,
      eta,
      route: terminal ? null : record.route,
      hospital: record.hospital,
      permissions: {
        canConfirmLocation: !terminal && record.pickup === null,
        canCorrectLocation: !terminal && record.pickup !== null,
        canContactControlRoom: !terminal,
        canContactDriver:
          !terminal &&
          record.assignment !== null &&
          ["AMBULANCE_ASSIGNED", "AMBULANCE_APPROACHING", "AMBULANCE_AT_PICKUP", "TRAVELLING_TO_HOSPITAL"].includes(
            record.phase,
          ),
      },
    };
  }

  private visibleTelemetry(record: EmergencyRecord, now: number): Telemetry | null {
    if (!record.telemetry) return null;
    const age = now - Date.parse(record.telemetry.observedAt);
    const stale = record.forcedStale || age > record.telemetry.staleAfterSeconds * 1000;
    return { ...record.telemetry, stale };
  }

  private eta(record: EmergencyRecord, telemetry: Telemetry, now: number) {
    const target =
      record.phase === "AMBULANCE_APPROACHING"
        ? record.pickup
        : record.phase === "TRAVELLING_TO_HOSPITAL"
          ? record.hospital
          : null;
    if (!target) return null;
    const km = haversineKm(telemetry, target);
    const seconds = Math.max(30, Math.round((km / 32) * 3600));
    return {
      estimatedArrivalAt: new Date(now + seconds * 1000).toISOString(),
      destination: record.phase === "TRAVELLING_TO_HOSPITAL" ? ("HOSPITAL" as const) : ("PICKUP" as const),
      source: "ROUTING" as const,
      demonstration: true as const,
    };
  }
}

function parseLocation(body: LocationConfirmationRequest): LocationConfirmationRequest {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "VALIDATION", "Location details are missing.");
  }
  if (body.confirmed !== true) {
    throw new HttpError(400, "VALIDATION", "Confirm the incident location before sending it.");
  }
  if (body.role !== "WITH_PATIENT" && body.role !== "REPORTING_OTHER_LOCATION") {
    throw new HttpError(400, "VALIDATION", "Choose how you are reporting this location.");
  }
  const clientSubmissionId = clean(body.clientSubmissionId, 80);
  if (!clientSubmissionId || clientSubmissionId.length < 8) {
    throw new HttpError(400, "VALIDATION", "A submission id is required.");
  }
  if (!Number.isInteger(body.expectedLocationVersion) || body.expectedLocationVersion < 0) {
    throw new HttpError(400, "VALIDATION", "Location version is missing.");
  }
  const pickup = parsePoint(body.pickup);
  assertTime(pickup.observedAt);
  const device = body.deviceObservation == null ? null : parseDevice(body.deviceObservation);
  return {
    clientSubmissionId,
    expectedLocationVersion: body.expectedLocationVersion,
    role: body.role,
    confirmed: true,
    pickup,
    deviceObservation: device,
    addressFormatted: clean(body.addressFormatted, 300),
    notes: {
      landmark: clean(body.notes?.landmark, 200),
      floor: clean(body.notes?.floor, 200),
      building: clean(body.notes?.building, 200),
      gate: clean(body.notes?.gate, 200),
      access: clean(body.notes?.access, 200),
    },
  };
}

function parsePoint(value: LocationConfirmationRequest["pickup"]): LocationConfirmationRequest["pickup"] {
  const sources: LocationSource[] = ["BROWSER_GPS", "MANUAL_PIN", "ADDRESS_SEARCH", "MANUAL_ENTRY"];
  if (!value || !sources.includes(value.source)) {
    throw new HttpError(400, "VALIDATION", "Location source is missing.");
  }
  return {
    latitude: coord(value.latitude, -90, 90),
    longitude: coord(value.longitude, -180, 180),
    accuracyMeters:
      value.source === "BROWSER_GPS" && typeof value.accuracyMeters === "number" && value.accuracyMeters >= 0
        ? value.accuracyMeters
        : null,
    observedAt: typeof value.observedAt === "string" ? value.observedAt : "",
    source: value.source,
  };
}

function parseDevice(value: NonNullable<LocationConfirmationRequest["deviceObservation"]>) {
  if (value.source !== "BROWSER_GPS") {
    throw new HttpError(400, "VALIDATION", "Device location must come from this phone.");
  }
  const observedAt = typeof value.observedAt === "string" ? value.observedAt : "";
  assertTime(observedAt);
  return {
    latitude: coord(value.latitude, -90, 90),
    longitude: coord(value.longitude, -180, 180),
    accuracyMeters: typeof value.accuracyMeters === "number" && value.accuracyMeters >= 0 ? value.accuracyMeters : null,
    observedAt,
    source: "BROWSER_GPS" as const,
  };
}

function assertTime(value: string): void {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new HttpError(400, "VALIDATION", "Location time is missing.");
}

function coord(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, "VALIDATION", "Latitude or longitude is not valid.");
  }
  return value;
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u001F]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeAmbulance(unit: number): Assignment {
  return {
    ambulanceId: `amb_demo_${unit}_${randomBytes(3).toString("hex")}`,
    unitLabel: `Unit ${unit}`,
    vehicleType: "Ambulance",
    registrationLabel: `DEMO-${unit}`,
  };
}

function offset(point: GeoPoint, dLat: number, dLng: number): GeoPoint {
  return { latitude: point.latitude + dLat, longitude: point.longitude + dLng };
}

function line(from: GeoPoint, to: GeoPoint, count: number, updatedAt: string): RoutePath {
  const points: GeoPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 1 : i / (count - 1);
    points.push({
      latitude: from.latitude + (to.latitude - from.latitude) * t,
      longitude: from.longitude + (to.longitude - from.longitude) * t,
    });
  }
  return { points, updatedAt };
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const r = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function statusKey(phase: TrackingPhase): string {
  switch (phase) {
    case "COORDINATING":
      return "status.coordinating";
    case "AMBULANCE_ASSIGNED":
      return "status.assigned";
    case "AMBULANCE_APPROACHING":
      return "status.approaching";
    case "AMBULANCE_AT_PICKUP":
      return "status.atPickup";
    case "TRAVELLING_TO_HOSPITAL":
      return "status.travelling";
    case "ARRIVED_AT_HOSPITAL":
      return "status.arrived";
    case "COMPLETED":
      return "status.completed";
    case "CANCELLED":
      return "status.cancelled";
    default:
      return "status.coordinating";
  }
}
