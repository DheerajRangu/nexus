import { EmergencyCase, Ambulance, Hospital, AmbulanceRank, HospitalRank, DispatchOffer, Mission, Roadblock, GreenCorridorSignal, SmsOutbox } from '../types';

const BASE_URL = '/api/v1';

// Initial Mock Seed Data for Fallback/Demo Mode
const mockAmbulances: Ambulance[] = [
  { ambulanceId: 'AMB-108-NORTH-01', licensePlate: 'KA-01-EQ-9012', capabilityTier: 'ALS', hasVentilator: true, hasDefibrillator: true, latitude: 12.9790, longitude: 77.5910, telemetryUpdatedAt: new Date().toISOString(), isAvailable: true, status: 'IDLE', assignedDriverId: 'usr-drv-01' },
  { ambulanceId: 'AMB-108-CENTRAL-02', licensePlate: 'KA-01-EQ-4421', capabilityTier: 'BLS', hasVentilator: false, hasDefibrillator: true, latitude: 12.9680, longitude: 77.6010, telemetryUpdatedAt: new Date().toISOString(), isAvailable: true, status: 'IDLE', assignedDriverId: 'usr-drv-02' },
  { ambulanceId: 'AMB-108-SOUTH-03', licensePlate: 'KA-05-EQ-1109', capabilityTier: 'ALS', hasVentilator: true, hasDefibrillator: true, latitude: 12.9210, longitude: 77.5840, telemetryUpdatedAt: new Date().toISOString(), isAvailable: true, status: 'IDLE', assignedDriverId: 'usr-drv-03' }
];

const mockHospitals: Hospital[] = [
  { hospitalId: 'HOSP-CITY-GENERAL-01', name: 'City General Trauma & Emergency Center', latitude: 12.9724, longitude: 77.5951, availableBeds: 14, availableIcu: 3, hasTraumaCenter: true, hasCardiacCathLab: true, emergencyWorkload: 'NORMAL', resourceUpdatedAt: new Date().toISOString() },
  { hospitalId: 'HOSP-ST-JUDE-02', name: 'St. Jude Specialty Hospital', latitude: 12.9352, longitude: 77.6245, availableBeds: 8, availableIcu: 1, hasTraumaCenter: true, hasCardiacCathLab: false, emergencyWorkload: 'HIGH', resourceUpdatedAt: new Date().toISOString() },
  { hospitalId: 'HOSP-METRO-CARE-03', name: 'MetroCare Super Specialty', latitude: 12.9850, longitude: 77.6080, availableBeds: 2, availableIcu: 0, hasTraumaCenter: false, hasCardiacCathLab: true, emergencyWorkload: 'CRITICAL', resourceUpdatedAt: new Date().toISOString() }
];

let mockCases: EmergencyCase[] = [
  {
    emergencyId: 'emg-883a-4912',
    externalCallRef: '108-CALL-99012',
    callbackNumber: '+91-9876543210',
    chiefComplaint: 'CARDIAC_ARREST',
    triagePriority: 'P1_CRITICAL',
    rawOperatorNotes: '54 y/o male collapsed at MG Road plaza, severe chest pain and unresponsiveness reported by bystander.',
    locationConfirmed: true,
    provisionalDispatch: false,
    currentState: 'LOCATION_CONFIRMED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

let mockMissions: Mission[] = [];
let mockOffers: DispatchOffer[] = [];
let mockRoadblocks: Roadblock[] = [
  {
    roadblockId: 'rb-metro-01',
    source: 'City Traffic Control (Metro Construction)',
    latitude: 12.9750,
    longitude: 77.5980,
    radiusMeters: 150.0,
    scope: 'FULL_BLOCK',
    verified: true,
    expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString()
  }
];

let mockSignals: GreenCorridorSignal[] = [
  { junctionId: 'jnc-01', name: 'Junction 1: MG Road & Brigade Junction', latitude: 12.9740, longitude: 77.6070, currentState: 'UNAVAILABLE', updatedAt: new Date().toISOString() },
  { junctionId: 'jnc-02', name: 'Junction 2: Trinity Circle Signal', latitude: 12.9720, longitude: 77.6160, currentState: 'UNAVAILABLE', updatedAt: new Date().toISOString() },
  { junctionId: 'jnc-03', name: 'Junction 3: Domlur Flyover Intersection', latitude: 12.9610, longitude: 77.6380, currentState: 'UNAVAILABLE', updatedAt: new Date().toISOString() }
];

let mockSmsOutbox: SmsOutbox[] = [
  {
    outboxId: 'sms-101',
    recipientPhone: '+91-9876543210',
    messageText: 'AEGIS Emergency Link: Confirm your exact location & track response: http://localhost:5173/track/tk_9f8a7c6b5d4e',
    status: 'SENT',
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString()
  },
  {
    outboxId: 'sms-102',
    recipientPhone: '+91-9000112233',
    messageText: 'AEGIS Emergency Link: Confirm your exact location & track response: http://localhost:5173/track/tk_failed_01',
    status: 'FAILED',
    failureReason: 'Provider Error 402: Carrier unreachable / Invalid phone number format',
    createdAt: new Date().toISOString()
  }
];

async function apiFetch<T>(url: string, options?: RequestInit, fallbackData?: T): Promise<T> {
  try {
    const res = await fetch(BASE_URL + url, options);
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    if (fallbackData !== undefined) {
      console.warn(`[AEGIS Offline Mode] API ${url} failed. Using fallback simulation data.`, err);
      return fallbackData;
    }
    throw err;
  }
}

export const aegisApi = {
  // Cases & Intake
  getCases: () => apiFetch<EmergencyCase[]>('/cases', undefined, mockCases),
  
  createWebhookIntake: async (payload: any) => {
    try {
      const res = await fetch(BASE_URL + '/intake/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aegis-Signature': 'sha256=demo_sig', 'X-Idempotency-Key': 'idemp-' + Date.now() },
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const newCase: EmergencyCase = {
      emergencyId: 'emg-' + Math.random().toString(36).substring(2, 9),
      externalCallRef: payload.externalCallRef || '108-CALL-' + Math.floor(Math.random() * 90000),
      callbackNumber: payload.callbackNumber || '+91-9876543210',
      chiefComplaint: 'CARDIAC_ARREST',
      triagePriority: 'P1_CRITICAL',
      rawOperatorNotes: payload.rawNotes,
      locationConfirmed: false,
      provisionalDispatch: false,
      currentState: 'INTAKE_CREATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    mockCases.unshift(newCase);
    return newCase;
  },

  createManualIntake: async (payload: any) => {
    try {
      const res = await fetch(BASE_URL + '/intake/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const newCase: EmergencyCase = {
      emergencyId: 'emg-' + Math.random().toString(36).substring(2, 9),
      callbackNumber: payload.callbackNumber,
      chiefComplaint: payload.chiefComplaint || 'GENERAL_EMERGENCY',
      triagePriority: payload.priority || 'P3_STANDARD',
      rawOperatorNotes: payload.notes,
      locationConfirmed: !payload.provisionalDispatch,
      provisionalDispatch: !!payload.provisionalDispatch,
      currentState: payload.provisionalDispatch ? 'LOCATION_CONFIRMED' : 'INTAKE_CREATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    mockCases.unshift(newCase);
    return newCase;
  },

  confirmLocation: async (emergencyId: string, locationData: any) => {
    try {
      const res = await fetch(BASE_URL + `/cases/${emergencyId}/confirm-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationData)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const c = mockCases.find(x => x.emergencyId === emergencyId);
    if (c) {
      c.locationConfirmed = true;
      if (c.currentState === 'INTAKE_CREATED') c.currentState = 'LOCATION_CONFIRMED';
      c.updatedAt = new Date().toISOString();
    }
    return c;
  },

  // Ambulances & Dispatch
  getAmbulances: () => apiFetch<Ambulance[]>('/telemetry/ambulances', undefined, mockAmbulances),

  shortlistAmbulances: async (emergencyId: string): Promise<AmbulanceRank[]> => {
    try {
      const res = await fetch(BASE_URL + `/dispatch/shortlist/${emergencyId}`);
      if (res.ok) return await res.json();
    } catch (e) {}

    return [
      {
        ambulanceId: 'AMB-108-NORTH-01',
        licensePlate: 'KA-01-EQ-9012',
        capabilityTier: 'ALS',
        distanceKm: 3.2,
        rawEtaMins: 5.5,
        correctedEtaMins: 7.2,
        score: 94.5,
        reasons: ['Distance to incident: 3.20 km', 'Traffic-adjusted ETA: 7.2 mins (base: 5.5 mins)', 'Capability Match: ALS unit equipped.'],
        driverId: 'usr-drv-01'
      },
      {
        ambulanceId: 'AMB-108-CENTRAL-02',
        licensePlate: 'KA-01-EQ-4421',
        capabilityTier: 'BLS',
        distanceKm: 4.8,
        rawEtaMins: 8.2,
        correctedEtaMins: 10.4,
        score: 72.1,
        reasons: ['Distance to incident: 4.80 km', 'Traffic-adjusted ETA: 10.4 mins', 'Sub-optimal capability match for P1 critical incident.'],
        driverId: 'usr-drv-02'
      }
    ];
  },

  createDispatchOffer: async (emergencyId: string, ambulanceId: string) => {
    try {
      const res = await fetch(BASE_URL + '/dispatch/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergencyId, ambulanceId })
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const offer: DispatchOffer = {
      offerId: 'off-' + Math.random().toString(36).substring(2, 9),
      emergencyId,
      ambulanceId,
      driverId: 'usr-drv-01',
      status: 'OFFERED',
      offeredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString()
    };
    mockOffers.push(offer);
    const c = mockCases.find(x => x.emergencyId === emergencyId);
    if (c) c.currentState = 'DISPATCHING';
    return offer;
  },

  respondToOffer: async (offerId: string, action: 'ACCEPT' | 'DECLINE') => {
    try {
      const res = await fetch(BASE_URL + `/dispatch/offer/${offerId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const offer = mockOffers.find(o => o.offerId === offerId);
    if (offer) {
      offer.status = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    }

    if (action === 'ACCEPT' && offer) {
      const amb = mockAmbulances.find(a => a.ambulanceId === offer.ambulanceId);
      if (amb) {
        amb.isAvailable = false;
        amb.status = 'ASSIGNED';
      }
      const c = mockCases.find(x => x.emergencyId === offer.emergencyId);
      if (c) {
        c.currentState = 'DISPATCHED';
        c.assignedAmbulanceId = offer.ambulanceId;
      }
      const mission: Mission = {
        missionId: 'msn-' + Math.random().toString(36).substring(2, 9),
        emergencyId: offer.emergencyId,
        ambulanceId: offer.ambulanceId,
        driverId: offer.driverId,
        currentState: 'DISPATCHED',
        pickupEtaMins: 7.2,
        startedAt: new Date().toISOString()
      };
      mockMissions.push(mission);
      return mission;
    }
    return null;
  },

  // Hospitals & Decision Engine
  getHospitals: () => apiFetch<Hospital[]>('/hospitals', undefined, mockHospitals),

  rankHospitals: async (emergencyId: string): Promise<HospitalRank[]> => {
    try {
      const res = await fetch(BASE_URL + `/hospitals/recommendations/${emergencyId}`);
      if (res.ok) return await res.json();
    } catch (e) {}

    return [
      {
        hospitalId: 'HOSP-CITY-GENERAL-01',
        name: 'City General Trauma & Emergency Center',
        travelEtaMins: 11.2,
        resourceReadyDelayMins: 2.0,
        handoverDelayMins: 5.0,
        totalTransparentEstimateMins: 16.2,
        availableBeds: 14,
        availableIcu: 3,
        specialistReady: true,
        score: 91.0,
        reasons: ['Travel ETA: 11.2 mins (6.4 km)', 'ER Workload: NORMAL (Prep delay: 2 mins)', 'Transparent Planning Estimate: max(11.2, 2.0) + 5.0 = 16.2 mins', 'Confirmed Capacity: 3 ICU beds available.']
      },
      {
        hospitalId: 'HOSP-ST-JUDE-02',
        name: 'St. Jude Specialty Hospital',
        travelEtaMins: 14.5,
        resourceReadyDelayMins: 8.0,
        handoverDelayMins: 5.0,
        totalTransparentEstimateMins: 19.5,
        availableBeds: 8,
        availableIcu: 1,
        specialistReady: true,
        score: 76.5,
        reasons: ['Travel ETA: 14.5 mins', 'ER Workload: HIGH (Prep delay: 8 mins)', 'Transparent Planning Estimate: max(14.5, 8.0) + 5.0 = 19.5 mins']
      }
    ];
  },

  reserveHospitalBed: async (emergencyId: string, hospitalId: string, requiredBeds = 1, requiredIcu = false) => {
    try {
      const res = await fetch(BASE_URL + '/hospitals/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergencyId, hospitalId, requiredBeds, requiredIcu })
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const hosp = mockHospitals.find(h => h.hospitalId === hospitalId);
    if (hosp) {
      if (requiredIcu) hosp.availableIcu = Math.max(0, hosp.availableIcu - requiredBeds);
      else hosp.availableBeds = Math.max(0, hosp.availableBeds - requiredBeds);
    }
    const c = mockCases.find(x => x.emergencyId === emergencyId);
    if (c) c.reservedHospitalId = hospitalId;
    const m = mockMissions.find(x => x.emergencyId === emergencyId);
    if (m) m.assignedHospitalId = hospitalId;

    return { reservationId: 'res-' + Math.random().toString(36).substring(2, 9), emergencyId, hospitalId, status: 'CONFIRMED' };
  },

  // Mission Transition
  transitionMission: async (missionId: string, nextState: string) => {
    try {
      const res = await fetch(BASE_URL + `/dispatch/missions/${missionId}/transition?nextState=${nextState}`, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (e) {}

    const m = mockMissions.find(x => x.missionId === missionId);
    if (m) {
      m.currentState = nextState;
      const c = mockCases.find(x => x.emergencyId === m.emergencyId);
      if (c) c.currentState = nextState as any;
      if (nextState === 'HANDOVER_COMPLETE' || nextState === 'CLOSED') {
        const amb = mockAmbulances.find(a => a.ambulanceId === m.ambulanceId);
        if (amb) {
          amb.isAvailable = true;
          amb.status = 'IDLE';
        }
      }
    }
    return m;
  },

  // Roadblocks & Corridor Signals
  getRoadblocks: () => apiFetch<Roadblock[]>('/roadblocks', undefined, mockRoadblocks),
  
  createRoadblock: async (payload: any) => {
    try {
      const res = await fetch(BASE_URL + '/roadblocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const rb: Roadblock = {
      roadblockId: 'rb-' + Math.random().toString(36).substring(2, 9),
      source: payload.source,
      latitude: payload.latitude,
      longitude: payload.longitude,
      radiusMeters: payload.radiusMeters || 100,
      scope: payload.scope || 'FULL_BLOCK',
      verified: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };
    mockRoadblocks.push(rb);
    return rb;
  },

  getCorridorSignals: () => apiFetch<GreenCorridorSignal[]>('/green-corridors/simulators', undefined, mockSignals),

  updateSignalState: async (junctionId: string, state: string) => {
    try {
      const res = await fetch(BASE_URL + `/green-corridors/simulators/${junctionId}/set-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
      if (res.ok) return await res.json();
    } catch (e) {}

    const s = mockSignals.find(x => x.junctionId === junctionId);
    if (s) {
      s.currentState = state as any;
      s.updatedAt = new Date().toISOString();
    }
    return s;
  },

  getSmsOutbox: async () => mockSmsOutbox,

  // Demo Controls
  resetSystem: async () => {
    try {
      await fetch(BASE_URL + '/demo/reset', { method: 'POST' });
    } catch (e) {}
    mockCases = [];
    mockMissions = [];
    mockOffers = [];
  }
};
