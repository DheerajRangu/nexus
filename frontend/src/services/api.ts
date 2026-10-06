import { EmergencyCase, IncidentLocation, Ambulance, Hospital, AmbulanceRank, HospitalRank, DispatchOffer, Mission, MissionRoute, Roadblock, GreenCorridorSignal, SmsOutbox } from '../types';

const BASE_URL = '/api/v1';
const TOKEN_KEY = 'aegis.accessToken';

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(BASE_URL + url, { ...options, headers });
  } catch {
    throw new ApiError('Control-room service is unreachable. Check the backend connection.');
  }

  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem(TOKEN_KEY);
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || body.title || body.message || message;
    } catch { /* Keep the HTTP status message. */ }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const aegisApi = {
  login: (username: string, password: string) => apiFetch<{ token: string; userId: string; username: string; role: string }>('/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password })
  }),
  saveToken: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clearToken: () => sessionStorage.removeItem(TOKEN_KEY),
  hasToken: () => Boolean(sessionStorage.getItem(TOKEN_KEY)),

  getCases: () => apiFetch<EmergencyCase[]>('/cases'),
  getLocations: () => apiFetch<IncidentLocation[]>('/locations'),
  createWebhookIntake: (payload: unknown) => apiFetch<EmergencyCase>('/demo/intake', { method: 'POST', body: JSON.stringify(payload) }),
  createManualIntake: (payload: unknown) => apiFetch<EmergencyCase>('/intake/manual', { method: 'POST', body: JSON.stringify(payload) }),
  confirmLocation: (emergencyId: string, locationData: unknown) => apiFetch<EmergencyCase>(`/cases/${encodeURIComponent(emergencyId)}/confirm-location`, { method: 'POST', body: JSON.stringify(locationData) }),

  getAmbulances: () => apiFetch<Ambulance[]>('/telemetry/ambulances'),
  shortlistAmbulances: (emergencyId: string) => apiFetch<AmbulanceRank[]>(`/dispatch/shortlist/${encodeURIComponent(emergencyId)}`),
  createDispatchOffer: (emergencyId: string, ambulanceId: string) => apiFetch<DispatchOffer>('/dispatch/offer', { method: 'POST', body: JSON.stringify({ emergencyId, ambulanceId }) }),
  getDispatchOffers: (emergencyId: string) => apiFetch<DispatchOffer[]>(`/dispatch/offers/${encodeURIComponent(emergencyId)}`),
  getActiveMissions: () => apiFetch<Mission[]>('/dispatch/missions'),
  getMissionRoute: (missionId: string) => apiFetch<MissionRoute>(`/dispatch/missions/${encodeURIComponent(missionId)}/route`),
  respondToOffer: (offerId: string, action: 'ACCEPT' | 'DECLINE') => apiFetch<Mission>(`/dispatch/offer/${encodeURIComponent(offerId)}/respond`, { method: 'POST', body: JSON.stringify({ action }) }),

  getHospitals: () => apiFetch<Hospital[]>('/hospitals'),
  rankHospitals: (emergencyId: string) => apiFetch<HospitalRank[]>(`/hospitals/recommendations/${encodeURIComponent(emergencyId)}`),
  reserveHospitalBed: (emergencyId: string, hospitalId: string, requiredBeds = 1, requiredIcu = false) => apiFetch<unknown>('/hospitals/reservations', { method: 'POST', body: JSON.stringify({ emergencyId, hospitalId, requiredBeds, requiredIcu }) }),
  transitionMission: (missionId: string, nextState: string) => apiFetch<Mission>(`/dispatch/missions/${encodeURIComponent(missionId)}/transition?nextState=${encodeURIComponent(nextState)}`, { method: 'POST' }),

  getRoadblocks: () => apiFetch<Roadblock[]>('/roadblocks'),
  createRoadblock: (payload: unknown) => apiFetch<Roadblock>('/roadblocks', { method: 'POST', body: JSON.stringify(payload) }),
  getCorridorSignals: () => apiFetch<GreenCorridorSignal[]>('/green-corridors/simulators'),
  updateSignalState: (junctionId: string, state: string) => apiFetch<GreenCorridorSignal>(`/green-corridors/simulators/${encodeURIComponent(junctionId)}/set-state`, { method: 'POST', body: JSON.stringify({ state }) }),
  getSmsOutbox: () => apiFetch<SmsOutbox[]>('/notifications/sms'),
  getDemoStatus: () => apiFetch<{ enabled: boolean; label: string }>('/demo/status'),
  resetSystem: () => apiFetch<unknown>('/demo/reset', { method: 'POST' }),
  runDemoScenario: () => apiFetch<Record<string, unknown>>('/demo/run-scenario', { method: 'POST' }),
  injectDemoScenario: (kind: string) => apiFetch<Record<string, unknown>>('/demo/inject', { method: 'POST', body: JSON.stringify({ kind }) })
};
