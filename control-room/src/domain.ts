export type UtcDateTime = string;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type MissionState =
  | 'CREATED'
  | 'LOCATION_PENDING'
  | 'READY_FOR_DISPATCH'
  | 'ASSIGNED'
  | 'EN_ROUTE_TO_PATIENT'
  | 'AT_PATIENT'
  | 'CANCELLED';

export type AmbulanceStatus = 'AVAILABLE' | 'ASSIGNED' | 'BUSY' | 'OFF_DUTY' | 'STALE';
export type Urgency = 'CRITICAL' | 'HIGH' | 'ROUTINE';
export type FailureMode =
  | 'NONE'
  | 'CONCURRENT_DISPATCH'
  | 'DRIVER_OFFLINE'
  | 'ACKNOWLEDGEMENT_TIMEOUT'
  | 'GPS_DISABLED'
  | 'STALE_TELEMETRY'
  | 'ROUTING_OUTAGE'
  | 'EQUIPMENT_FAILURE'
  | 'NETWORK_LOSS';

export type AllowedAction =
  | 'DISPATCH_AMBULANCE'
  | 'CORRECT_PICKUP'
  | 'REASSIGN_AMBULANCE'
  | 'RESET_DEMO'
  | 'INJECT_FAILURE';

export interface PickupLocation {
  coordinates?: Coordinates;
  source: 'OPERATOR_CONFIRMED' | 'CALL_TAKER' | 'EXTERNAL_INTEGRATION';
  confirmationStatus: 'CONFIRMED' | 'UNCERTAIN' | 'PENDING';
  accuracyMeters?: number;
  capturedAt: UtcDateTime;
  confirmedAt?: UtcDateTime;
  address: string;
  landmark?: string;
  building?: string;
  floor?: string;
  gate?: string;
  entrance?: string;
  accessInstructions?: string;
}

export interface Telemetry {
  trackingSessionId: string;
  sequenceNumber: number;
  capturedAt: UtcDateTime;
  coordinates: Coordinates;
  accuracyMeters?: number;
  bearingDegrees?: number;
  speedKph?: number;
  freshness: 'LIVE' | 'STALE' | 'UNAVAILABLE';
}

export interface Ambulance {
  ambulanceId: string;
  callSign: string;
  status: AmbulanceStatus;
  readiness: 'READY' | 'LIMITED' | 'UNAVAILABLE';
  capabilities: string[];
  crewCapabilities: string[];
  capacity: 'BASIC' | 'ADVANCED';
  telemetry?: Telemetry;
}

export interface Candidate {
  ambulance: Ambulance;
  eligible: boolean;
  ranking?: number;
  roadEtaSeconds?: number;
  roadDistanceMeters?: number;
  etaSource: 'GOOGLE_ROUTES' | 'APPROXIMATE' | 'UNAVAILABLE';
  etaCalculatedAt?: UtcDateTime;
  reasons: string[];
  exclusionReasons: string[];
}

export interface Route {
  routeVersion: number;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'STALE';
  provider: 'GOOGLE_ROUTES' | 'DEMO_ADAPTER' | 'UNAVAILABLE';
  calculatedAt?: UtcDateTime;
  distanceMeters?: number;
  durationSeconds?: number;
  geometry: Coordinates[];
}

export interface Assignment {
  assignmentId: string;
  ambulanceId: string;
  state: 'CONFIRMED' | 'SUPERSEDED' | 'CANCELLED';
  confirmedAt: UtcDateTime;
  receivedAt?: UtcDateTime;
  acknowledgedAt?: UtcDateTime;
  enRouteAt?: UtcDateTime;
  acknowledgementDeadline?: UtcDateTime;
  route?: Route;
}

export interface TimelineItem {
  eventId: string;
  occurredAt: UtcDateTime;
  label: string;
  detail: string;
  kind: 'SYSTEM' | 'ASSIGNMENT' | 'TELEMETRY' | 'RISK';
}

export interface OperationalAlert {
  alertId: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  label: string;
  detail: string;
  occurredAt: UtcDateTime;
}

export interface ProviderHealth {
  routing: 'HEALTHY' | 'UNAVAILABLE' | 'DEGRADED';
  realtime: 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';
  mode: 'LIVE' | 'SIMULATION';
}

export interface EmergencySnapshot {
  schemaVersion: 'v1';
  emergencyId: string;
  missionId: string;
  entityVersion: number;
  state: MissionState;
  urgency: Urgency;
  pickup: PickupLocation;
  requiredEquipment: string[];
  requiredCrewCapabilities: string[];
  requiredCapacity: 'BASIC' | 'ADVANCED';
  notes?: string;
  operator: { displayName: string; confirmedAt: UtcDateTime };
  candidates: Candidate[];
  assignment?: Assignment;
  providerHealth: ProviderHealth;
  alerts: OperationalAlert[];
  timeline: TimelineItem[];
  allowedActions: AllowedAction[];
  updatedAt: UtcDateTime;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  currentEntityVersion?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorShape;

  constructor(status: number, body: ApiErrorShape) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type ControlRoomEvent =
  | { type: 'snapshot.updated'; eventId: string; entityVersion: number; snapshot: EmergencySnapshot }
  | {
      type: 'ambulance.telemetry.updated';
      eventId: string;
      entityVersion: number;
      ambulanceId: string;
      telemetry: Telemetry;
    }
  | { type: 'connection.state'; eventId: string; entityVersion: number; state: 'CONNECTED' | 'RECONNECTING' | 'OFFLINE' };

export interface DispatchRequest {
  ambulanceId: string;
  entityVersion: number;
  idempotencyKey: string;
}

export interface PickupCorrectionRequest {
  entityVersion: number;
  address: string;
  coordinates?: Coordinates;
  accuracyMeters?: number;
  accessInstructions?: string;
  justification: string;
}

export interface ReassignmentRequest {
  entityVersion: number;
  ambulanceId: string;
  reason: string;
  idempotencyKey: string;
}

export interface DemoFailureRequest {
  mode: FailureMode;
}

export interface Subscription {
  close: () => void;
}

export interface ControlRoomGateway {
  readonly source: 'api' | 'demo';
  getSnapshot(emergencyId: string): Promise<EmergencySnapshot>;
  subscribe(emergencyId: string, onEvent: (event: ControlRoomEvent) => void): Subscription;
  dispatch(emergencyId: string, request: DispatchRequest): Promise<EmergencySnapshot>;
  correctPickup(emergencyId: string, request: PickupCorrectionRequest): Promise<EmergencySnapshot>;
  reassign(emergencyId: string, request: ReassignmentRequest): Promise<EmergencySnapshot>;
  resetDemo(): Promise<EmergencySnapshot>;
  injectFailure(emergencyId: string, request: DemoFailureRequest): Promise<EmergencySnapshot>;
}
