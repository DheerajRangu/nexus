/**
 * AEGIS citizen / patient tracking contract 1.0.0.
 *
 * Spring Boot owns emergencies, missions, assignments, hospital reservations,
 * authorization, and tracking sessions in the shared PostgreSQL database.
 * This module is the versioned wire contract for the citizen surface only.
 */

export const CONTRACT_VERSION = "1.0.0" as const;

export type Lang = "en" | "te" | "hi";

export type TrackingPhase =
  | "COORDINATING"
  | "AMBULANCE_ASSIGNED"
  | "AMBULANCE_APPROACHING"
  | "AMBULANCE_AT_PICKUP"
  | "TRAVELLING_TO_HOSPITAL"
  | "ARRIVED_AT_HOSPITAL"
  | "COMPLETED"
  | "CANCELLED";

export type LocationSource = "BROWSER_GPS" | "MANUAL_PIN" | "ADDRESS_SEARCH" | "MANUAL_ENTRY";

export type ReporterRole = "WITH_PATIENT" | "REPORTING_OTHER_LOCATION";

export type EntityName = "mission" | "assignment" | "telemetry" | "route" | "hospital" | "location";

export type EventType =
  | "mission.updated"
  | "assignment.changed"
  | "telemetry.position"
  | "route.updated"
  | "hospital.changed"
  | "location.updated"
  | "session.expired";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocationNotes {
  landmark: string | null;
  floor: string | null;
  building: string | null;
  gate: string | null;
  access: string | null;
}

export interface ConfirmedPickup extends GeoPoint {
  accuracyMeters: number | null;
  observedAt: string;
  source: LocationSource;
  addressFormatted: string | null;
  notes: LocationNotes;
  role: ReporterRole;
  confirmedAt: string;
}

export interface Assignment {
  ambulanceId: string;
  unitLabel: string;
  vehicleType: string;
  registrationLabel: string;
}

export interface Telemetry extends GeoPoint {
  ambulanceId: string;
  accuracyMeters: number | null;
  observedAt: string;
  stale: boolean;
  staleAfterSeconds: number;
}

export interface Eta {
  estimatedArrivalAt: string;
  destination: "PICKUP" | "HOSPITAL";
  source: "ROUTING";
  demonstration: boolean;
}

export interface RoutePath {
  points: GeoPoint[];
  updatedAt: string;
}

/** Present only after the hospital destination is confirmed. */
export interface Hospital extends GeoPoint {
  hospitalId: string;
  name: string;
  confirmed: true;
}

export interface LocationCorrectionNotice {
  alertedControlRoom: boolean;
  alertedDriver: boolean;
  hospitalChanged: false;
  at: string;
}

export interface LocationView {
  confirmationRequired: boolean;
  confirmedPickup: ConfirmedPickup | null;
  correction: LocationCorrectionNotice | null;
}

export interface Versions {
  mission: number;
  assignment: number;
  telemetry: number;
  route: number;
  hospital: number;
  location: number;
}

export interface TrackingPermissions {
  canConfirmLocation: boolean;
  canCorrectLocation: boolean;
  canContactControlRoom: boolean;
  canContactDriver: boolean;
}

export interface TrackingSnapshot {
  contractVersion: typeof CONTRACT_VERSION;
  /** True only for the labelled development lifecycle. Live Spring Boot snapshots use false. */
  synthetic: boolean;
  emergencyId: string;
  missionId: string | null;
  missionReference: string;
  phase: TrackingPhase;
  statusKey: string;
  /** Machine key for a backend explanation. Clients may translate known keys. */
  explanationKey: string;
  statusExplanation: string | null;
  dispatchDelayed: boolean;
  serverTime: string;
  updatedAt: string;
  accessExpiresAt: string;
  lastEventId: string;
  /** Monotonic aggregate. Incremental events advance this by exactly 1. */
  stateVersion: number;
  versions: Versions;
  location: LocationView;
  assignment: Assignment | null;
  telemetry: Telemetry | null;
  eta: Eta | null;
  route: RoutePath | null;
  hospital: Hospital | null;
  permissions: TrackingPermissions;
}

export interface TrackingEvent {
  eventId: string;
  sequence: number;
  contractVersion: typeof CONTRACT_VERSION;
  type: EventType;
  emergencyId: string;
  missionId: string | null;
  entity: EntityName | "session";
  version: number;
  occurredAt: string;
  snapshot: TrackingSnapshot | null;
}

export interface DeviceObservation extends GeoPoint {
  accuracyMeters: number | null;
  observedAt: string;
  source: "BROWSER_GPS";
}

export interface LocationConfirmationRequest {
  clientSubmissionId: string;
  expectedLocationVersion: number;
  role: ReporterRole;
  confirmed: boolean;
  pickup: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    observedAt: string;
    source: LocationSource;
  };
  /** Caller device fix. Never becomes the pickup point by itself. */
  deviceObservation: DeviceObservation | null;
  addressFormatted: string | null;
  notes: LocationNotes;
}

export interface LocationAlerts {
  controlRoom: boolean;
  driver: boolean;
  hospitalChanged: false;
}

export interface LocationConfirmationResponse {
  contractVersion: typeof CONTRACT_VERSION;
  tracking: TrackingSnapshot;
  alerts: LocationAlerts;
}

export interface SessionExchangeRequest {
  linkToken: string;
}

export interface SessionResponse {
  contractVersion: typeof CONTRACT_VERSION;
  sessionExpiresAt: string;
  tracking: TrackingSnapshot;
}

export interface DemoSessionResponse extends SessionResponse {
  label: "DEVELOPMENT DEMO";
  synthetic: true;
  notice: string;
}

export interface ContactResponse {
  contractVersion: typeof CONTRACT_VERSION;
  method: "tel";
  phone: string;
  expiresAt: string;
  /** True when the number is a control-room relay rather than a direct handset. */
  relay: boolean;
}

export interface PlaceResult extends GeoPoint {
  label: string;
}

export interface PlaceSearchResponse {
  contractVersion: typeof CONTRACT_VERSION;
  syntheticAddress: boolean;
  results: PlaceResult[];
}

export interface ApiErrorBody {
  contractVersion: typeof CONTRACT_VERSION;
  code: string;
  message: string;
}

export const DEMO_STEPS = [
  "assign",
  "telemetry",
  "at_pickup",
  "travel",
  "arrive",
  "complete",
  "cancel",
  "delay",
  "change_assignment",
  "change_hospital",
  "stale_telemetry",
  "expire_access",
] as const;

export type DemoStep = (typeof DEMO_STEPS)[number];

export interface DemoAdvanceRequest {
  step: DemoStep;
}

export interface DemoAdvanceResponse {
  contractVersion: typeof CONTRACT_VERSION;
  label: "DEVELOPMENT DEMO";
  tracking: TrackingSnapshot;
}

export const ERROR_CODES = [
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_REVOKED",
  "SESSION_REQUIRED",
  "SESSION_EXPIRED",
  "CROSS_MISSION_DENIED",
  "LOCATION_CLOSED",
  "VERSION_CONFLICT",
  "VALIDATION",
  "DRIVER_CONTACT_UNAUTHORIZED",
  "UNAVAILABLE",
  "CONTRACT_UNSUPPORTED",
  "DEMO_DISABLED",
  "DEMO_STEP_UNAVAILABLE",
  "NOT_SYNTHETIC",
  "IDEMPOTENCY_CONFLICT",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
