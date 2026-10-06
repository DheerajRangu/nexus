import type {
  Candidate, ControlRoomEvent, ControlRoomGateway, DemoFailureRequest, DispatchRequest,
  EmergencySnapshot, PickupCorrectionRequest, ReassignmentRequest, Subscription,
} from './domain';

const demoTime = () => new Date().toISOString();
const route = (from: [number, number], to: [number, number]) => [
  { latitude: from[0], longitude: from[1] }, { latitude: 12.9694, longitude: 77.5905 }, { latitude: to[0], longitude: to[1] },
];

export const initialDemoSnapshot = (): EmergencySnapshot => {
  const now = demoTime();
  return {
    schemaVersion: 'v1', emergencyId: 'EM-2026-001', missionId: '00000000-0000-0000-0000-000000000101', entityVersion: 1,
    state: 'READY_FOR_DISPATCH', urgency: 'CRITICAL',
    pickup: { coordinates: { latitude: 12.9716, longitude: 77.5946 }, source: 'OPERATOR_CONFIRMED', confirmationStatus: 'CONFIRMED', accuracyMeters: 18, capturedAt: now, confirmedAt: now, address: '42 Residency Road, Bengaluru', landmark: 'North gate, opposite Metro entrance', accessInstructions: 'Use north gate; patient is on ground floor.' },
    requiredEquipment: ['TRAUMA_KIT', 'VENTILATOR'], requiredCrewCapabilities: ['ALS', 'TRAUMA'], requiredCapacity: 'ADVANCED', notes: 'Fictional deterministic demonstration. Requirements must be operator-confirmed in live use.', operator: { displayName: 'Demo Operator', confirmedAt: now },
    candidates: [
      candidate('AMB-A', 'AVAILABLE', ['BASIC_LIFE_SUPPORT'], ['BLS'], 'BASIC', [12.9734, 77.5902], false, [], ['Missing equipment: TRAUMA_KIT, VENTILATOR', 'Missing crew capability: ALS, TRAUMA', 'Insufficient patient transport capacity'], 1),
      candidate('AMB-B', 'AVAILABLE', ['TRAUMA_KIT', 'VENTILATOR', 'MONITOR'], ['ALS', 'TRAUMA'], 'ADVANCED', [12.9654, 77.5878], true, ['Meets confirmed equipment, crew, capacity, readiness, and fresh-location requirements.', 'Recommended over nearer AMB-A because capability eligibility comes first.'], [], 2, 420, 6100),
      candidate('AMB-C', 'BUSY', ['TRAUMA_KIT', 'VENTILATOR'], ['ALS', 'TRAUMA'], 'ADVANCED', [12.9755, 77.602], false, [], ['Vehicle is busy with a conflicting active assignment'], 3),
      candidate('AMB-D', 'OFF_DUTY', ['TRAUMA_KIT', 'VENTILATOR'], ['ALS', 'TRAUMA'], 'ADVANCED', [12.962, 77.601], false, [], ['Driver is not on an active shift', 'Vehicle is off duty'], 4),
      candidate('AMB-E', 'STALE', ['TRAUMA_KIT', 'VENTILATOR'], ['ALS', 'TRAUMA'], 'ADVANCED', [12.98, 77.61], false, [], ['Location telemetry is stale or unavailable'], 5),
      candidate('AMB-F', 'AVAILABLE', ['TRAUMA_KIT', 'VENTILATOR'], ['ALS', 'TRAUMA'], 'ADVANCED', [12.978, 77.585], false, [], ['Equipment readiness is not confirmed'], 6),
    ],
    providerHealth: { routing: 'HEALTHY', realtime: 'CONNECTED', mode: 'SIMULATION' }, alerts: [], timeline: [{ eventId: 'evt-demo-open', occurredAt: now, label: 'incident.ready.for.dispatch', detail: 'Operator confirmed pickup and dispatch requirements.', kind: 'SYSTEM' }], allowedActions: ['DISPATCH_AMBULANCE', 'CORRECT_PICKUP', 'RESET_DEMO', 'INJECT_FAILURE'], updatedAt: now,
  };
};

function candidate(ambulanceId: string, status: Candidate['ambulance']['status'], capabilities: string[], crewCapabilities: string[], capacity: Candidate['ambulance']['capacity'], [latitude, longitude]: [number, number], eligible: boolean, reasons: string[], exclusionReasons: string[], sequenceNumber: number, roadEtaSeconds?: number, roadDistanceMeters?: number): Candidate {
  const stale = status === 'STALE';
  return { ambulance: { ambulanceId, callSign: ambulanceId, status, readiness: ambulanceId === 'AMB-F' ? 'UNAVAILABLE' : 'READY', capabilities, crewCapabilities, capacity, telemetry: { trackingSessionId: `session-${ambulanceId}`, sequenceNumber, capturedAt: new Date(Date.now() - (stale ? 310_000 : 9_000)).toISOString(), coordinates: { latitude, longitude }, accuracyMeters: stale ? 32 : 10, bearingDegrees: 45, speedKph: status === 'AVAILABLE' ? 30 : 0, freshness: stale ? 'STALE' : 'LIVE' } }, eligible, ranking: eligible ? 1 : undefined, roadEtaSeconds, roadDistanceMeters, etaSource: eligible ? 'APPROXIMATE' : 'UNAVAILABLE', etaCalculatedAt: eligible ? demoTime() : undefined, reasons, exclusionReasons };
}

class DemoGateway implements ControlRoomGateway {
  readonly source = 'demo' as const;
  private value = initialDemoSnapshot(); private listeners = new Set<(event: ControlRoomEvent) => void>(); private timer?: number;
  async getSnapshot(): Promise<EmergencySnapshot> { return structuredClone(this.value); }
  subscribe(_: string, onEvent: (event: ControlRoomEvent) => void): Subscription { this.listeners.add(onEvent); this.ensureMotion(); return { close: () => { this.listeners.delete(onEvent); if (!this.listeners.size && this.timer) window.clearInterval(this.timer); } }; }
  private emit() { const event: ControlRoomEvent = { type: 'snapshot.updated', eventId: crypto.randomUUID(), entityVersion: this.value.entityVersion, snapshot: structuredClone(this.value) }; this.listeners.forEach((listener) => listener(event)); }
  private update(updater: (value: EmergencySnapshot) => void) { updater(this.value); this.value.entityVersion += 1; this.value.updatedAt = demoTime(); this.emit(); return structuredClone(this.value); }
  private ensureMotion() { if (this.timer) return; this.timer = window.setInterval(() => { const selected = this.value.assignment?.ambulanceId; const candidate = this.value.candidates.find((item) => item.ambulance.ambulanceId === selected); const pickup = this.value.pickup.coordinates; const position = candidate?.ambulance.telemetry?.coordinates; if (!candidate || !pickup || !position || this.value.state !== 'EN_ROUTE_TO_PATIENT') return; position.latitude += (pickup.latitude - position.latitude) * 0.06; position.longitude += (pickup.longitude - position.longitude) * 0.06; candidate.ambulance.telemetry!.capturedAt = demoTime(); candidate.ambulance.telemetry!.sequenceNumber += 1; this.update(() => {}); }, 1400); }
  async dispatch(_: string, request: DispatchRequest) { return this.update((value) => { const c = value.candidates.find((item) => item.ambulance.ambulanceId === request.ambulanceId); if (!c?.eligible) throw new Error('This ambulance is not eligible for direct dispatch.'); const now = demoTime(); value.state = 'ASSIGNED'; c.ambulance.status = 'ASSIGNED'; value.assignment = { assignmentId: crypto.randomUUID(), ambulanceId: request.ambulanceId, state: 'CONFIRMED', confirmedAt: now, acknowledgementDeadline: new Date(Date.now() + 120_000).toISOString(), route: { routeVersion: value.entityVersion + 1, status: 'AVAILABLE', provider: 'DEMO_ADAPTER', calculatedAt: now, distanceMeters: c.roadDistanceMeters, durationSeconds: c.roadEtaSeconds, geometry: route([c.ambulance.telemetry!.coordinates.latitude, c.ambulance.telemetry!.coordinates.longitude], [value.pickup.coordinates!.latitude, value.pickup.coordinates!.longitude]) } }; value.timeline.unshift({ eventId: crypto.randomUUID(), occurredAt: now, label: 'assignment.confirmed', detail: `${request.ambulanceId} directly assigned by backend simulation.`, kind: 'ASSIGNMENT' }); value.allowedActions = ['CORRECT_PICKUP', 'REASSIGN_AMBULANCE', 'RESET_DEMO', 'INJECT_FAILURE']; }); }
  async correctPickup(_: string, request: PickupCorrectionRequest) { return this.update((value) => { const now = demoTime(); value.pickup = { ...value.pickup, coordinates: request.coordinates ?? value.pickup.coordinates, address: request.address, accuracyMeters: request.accuracyMeters, accessInstructions: request.accessInstructions, capturedAt: now, confirmedAt: now, source: 'OPERATOR_CONFIRMED' }; value.assignment && (value.assignment.route = { ...value.assignment.route!, routeVersion: value.entityVersion + 1, calculatedAt: now }); value.timeline.unshift({ eventId: crypto.randomUUID(), occurredAt: now, label: 'pickup.location.changed', detail: `Correction recorded: ${request.justification}`, kind: 'RISK' }); }); }
  async reassign(_: string, request: ReassignmentRequest) { return this.update((value) => { const now = demoTime(); const next = value.candidates.find((item) => item.ambulance.ambulanceId === request.ambulanceId); if (!next?.eligible) throw new Error('Reassignment candidate is not eligible.'); const previous = value.candidates.find((item) => item.ambulance.ambulanceId === value.assignment?.ambulanceId); if (previous) previous.ambulance.status = 'AVAILABLE'; next.ambulance.status = 'ASSIGNED'; value.timeline.unshift({ eventId: crypto.randomUUID(), occurredAt: now, label: 'assignment.superseded', detail: `Previous assignment superseded: ${request.reason}`, kind: 'RISK' }); value.assignment = { assignmentId: crypto.randomUUID(), ambulanceId: next.ambulance.ambulanceId, state: 'CONFIRMED', confirmedAt: now, acknowledgementDeadline: new Date(Date.now() + 120_000).toISOString(), route: { routeVersion: value.entityVersion + 1, status: 'AVAILABLE', provider: 'DEMO_ADAPTER', calculatedAt: now, distanceMeters: next.roadDistanceMeters, durationSeconds: next.roadEtaSeconds, geometry: route([next.ambulance.telemetry!.coordinates.latitude, next.ambulance.telemetry!.coordinates.longitude], [value.pickup.coordinates!.latitude, value.pickup.coordinates!.longitude]) } }; value.state = 'ASSIGNED'; }); }
  async resetDemo() { this.value = initialDemoSnapshot(); this.emit(); return structuredClone(this.value); }
  async injectFailure(_: string, request: DemoFailureRequest) { return this.update((value) => { const now = demoTime(); value.alerts = request.mode === 'NONE' ? [] : [{ alertId: crypto.randomUUID(), level: request.mode === 'ROUTING_OUTAGE' ? 'WARNING' : 'CRITICAL', label: request.mode.replaceAll('_', ' '), detail: 'Deterministic simulation failure injected; no live provider claim is made.', occurredAt: now }]; if (request.mode === 'ROUTING_OUTAGE') value.providerHealth.routing = 'UNAVAILABLE'; if (request.mode === 'DRIVER_OFFLINE') value.providerHealth.realtime = 'OFFLINE'; }); }
}

class HttpGateway implements ControlRoomGateway {
  readonly source = 'api' as const;
  constructor(private readonly baseUrl: string, private readonly basicAuth: string) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { Authorization: `Basic ${this.basicAuth}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } }); if (!response.ok) { const body = await response.json().catch(() => ({ message: response.statusText })); throw Object.assign(new Error(body.message ?? 'Request failed'), { status: response.status, body }); } return response.json() as Promise<T>; }
  getSnapshot(id: string) { return this.request<EmergencySnapshot>(`/api/v1/control-room/emergencies/${id}`); }
  subscribe(id: string, onEvent: (event: ControlRoomEvent) => void): Subscription { let stopped = false; let version = -1; const tick = async () => { if (stopped) return; try { const snapshot = await this.getSnapshot(id); if (snapshot.entityVersion > version) { version = snapshot.entityVersion; onEvent({ type: 'snapshot.updated', eventId: crypto.randomUUID(), entityVersion: version, snapshot }); } } catch { onEvent({ type: 'connection.state', eventId: crypto.randomUUID(), entityVersion: version, state: 'RECONNECTING' }); } finally { if (!stopped) window.setTimeout(tick, 2000); } }; void tick(); return { close: () => { stopped = true; } }; }
  dispatch(id: string, body: DispatchRequest) { return this.request<EmergencySnapshot>(`/api/v1/control-room/emergencies/${id}/dispatch`, { method: 'POST', body: JSON.stringify(body) }); }
  correctPickup(id: string, body: PickupCorrectionRequest) { return this.request<EmergencySnapshot>(`/api/v1/control-room/emergencies/${id}/pickup-corrections`, { method: 'POST', body: JSON.stringify({ ...body, latitude: body.coordinates?.latitude, longitude: body.coordinates?.longitude, source: 'OPERATOR_CONFIRMED' }) }); }
  reassign(id: string, body: ReassignmentRequest) { return this.request<EmergencySnapshot>(`/api/v1/control-room/emergencies/${id}/reassign`, { method: 'POST', body: JSON.stringify(body) }); }
  resetDemo() { return this.request<EmergencySnapshot>('/api/v1/demo/reset', { method: 'POST' }); }
  injectFailure(id: string, body: DemoFailureRequest) { return this.request<EmergencySnapshot>(`/api/v1/demo/emergencies/${id}/failures`, { method: 'POST', body: JSON.stringify(body) }); }
}

export const controlRoomGateway = (): ControlRoomGateway => {
  const base = import.meta.env.VITE_AEGIS_API_URL as string | undefined;
  const auth = import.meta.env.VITE_AEGIS_BASIC_AUTH as string | undefined;
  return base && auth ? new HttpGateway(base.replace(/\/$/, ''), btoa(auth)) : new DemoGateway();
};
