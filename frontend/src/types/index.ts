export interface EmergencyCase {
  emergencyId: string;
  externalCallRef?: string;
  callbackNumber: string;
  operatorId?: string;
  chiefComplaint?: string;
  triagePriority: 'P1_CRITICAL' | 'P2_URGENT' | 'P3_STANDARD';
  rawOperatorNotes?: string;
  locationConfirmed: boolean;
  provisionalDispatch: boolean;
  currentState: 'INTAKE_CREATED' | 'LOCATION_CONFIRMED' | 'DISPATCHING' | 'DISPATCHED' | 'EN_ROUTE_PATIENT' | 'PATIENT_PICKED_UP' | 'EN_ROUTE_HOSPITAL' | 'ARRIVED_HOSPITAL' | 'HANDOVER_COMPLETE' | 'CLOSED';
  assignedAmbulanceId?: string;
  reservedHospitalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentLocation {
  locationId: string;
  emergencyId: string;
  callerLat?: number;
  callerLng?: number;
  callerAccuracyMeters?: number;
  confirmedLat?: number;
  confirmedLng?: number;
  confirmedAddress?: string;
  buildingFloorNotes?: string;
  locationSource: string;
}

export interface Ambulance {
  ambulanceId: string;
  licensePlate: string;
  capabilityTier: 'ALS' | 'BLS' | 'PATIENT_TRANSPORT';
  hasVentilator: boolean;
  hasDefibrillator: boolean;
  latitude: number;
  longitude: number;
  telemetryUpdatedAt: string;
  isAvailable: boolean;
  status: string;
  assignedDriverId?: string;
}

export interface Hospital {
  hospitalId: string;
  name: string;
  latitude: number;
  longitude: number;
  availableBeds: number;
  availableIcu: number;
  hasTraumaCenter: boolean;
  hasCardiacCathLab: boolean;
  emergencyWorkload: 'NORMAL' | 'HIGH' | 'CRITICAL';
  resourceUpdatedAt: string;
}

export interface AmbulanceRank {
  ambulanceId: string;
  licensePlate: string;
  capabilityTier: string;
  distanceKm: number;
  rawEtaMins: number;
  correctedEtaMins: number;
  score: number;
  reasons: string[];
  driverId: string;
  routingProvider?: string;
  simulated?: boolean;
}

export interface HospitalRank {
  hospitalId: string;
  name: string;
  travelEtaMins: number;
  resourceReadyDelayMins: number;
  handoverDelayMins: number;
  totalTransparentEstimateMins: number;
  availableBeds: number;
  availableIcu: number;
  specialistReady: boolean;
  score: number;
  reasons: string[];
}

export interface DispatchOffer {
  offerId: string;
  emergencyId: string;
  ambulanceId: string;
  driverId: string;
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  offeredAt: string;
  expiresAt: string;
  respondedAt?: string;
}

export interface Mission {
  missionId: string;
  emergencyId: string;
  ambulanceId: string;
  driverId: string;
  assignedHospitalId?: string;
  currentState: string;
  pickupEtaMins?: number;
  hospitalEtaMins?: number;
  startedAt: string;
  completedAt?: string;
}

export interface MissionRoute {
  missionId: string;
  emergencyId: string;
  leg: 'TO_PATIENT' | 'TO_HOSPITAL';
  missionState: string;
  routeAvailable: boolean;
  status?: string;
  estimatedDurationMins?: number;
  distanceKm?: number;
  simulated?: boolean;
  provider?: string;
  routeVersion?: number;
  locationUpdatedAt?: string;
  recalculatedAt?: string;
  destinationLabel?: string;
  locationConfirmed?: boolean;
  locationAccuracyMeters?: number;
  operatorAlert?: string;
  points?: { latitude: number; longitude: number }[];
}

export interface Roadblock {
  roadblockId: string;
  source: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  scope: string;
  verified: boolean;
  expiresAt: string;
}

export interface GreenCorridorSignal {
  junctionId: string;
  name: string;
  latitude: number;
  longitude: number;
  currentState: 'REQUESTED' | 'ACKNOWLEDGED' | 'CLEARING' | 'ACTIVE' | 'PASSED' | 'EXPIRED' | 'UNAVAILABLE';
  activeMissionId?: string;
  updatedAt: string;
}

export interface SmsOutbox {
  outboxId: string;
  recipientPhone: string;
  messageText: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  failureReason?: string;
  createdAt: string;
  sentAt?: string;
}
