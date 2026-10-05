# AEGIS Operational Contracts & Lifecycles

## 1. Core Identifiers & Standards
All services (Spring Boot operational core, FastAPI AI engine, React Control Room UI, Flutter Driver App, Hospital Portal, Citizen Web) MUST enforce uniform key identifiers and standards:

- `emergencyId`: UUID string (e.g. `emg-883a-4912-8f92-91a011`)
- `missionId`: UUID string (e.g. `msn-1102-4b21-99af-012920`)
- `ambulanceId`: Alphanumeric ID (e.g. `AMB-108-NORTH-04`)
- `hospitalId`: Alphanumeric ID (e.g. `HOSP-CITY-GENERAL-01`)
- `eventId`: UUID string (e.g. `evt-7712-4211-aa99-123456`)
- `entityVersion`: Monotonic Integer starting at `1` for optimistic locking & concurrency control
- `timestamps`: ISO-8601 UTC string (e.g. `2026-10-06T00:00:00.000Z`)

---

## 2. Mission State Machine
```
   [CALL INTAKE / UNVERIFIED]
             │
             ▼ (Location Confirmed by Citizen/Operator)
   [LOCATION_CONFIRMED]
             │
             ▼ (Dispatch Engine Search & Offer)
   [DISPATCHING]
             │
      ┌──────┴──────┐
      │ (Declined/   │ (Driver Accepts)
      │  Expired)   ▼
      └──► [DISPATCHED]
             │
             ▼ (Driver Moves)
   [EN_ROUTE_PATIENT]
             │
             ▼ (Patient Loaded)
   [PATIENT_PICKED_UP] ◄─── (Hospital Decision & Reservation Confirmed)
             │
             ▼
   [EN_ROUTE_HOSPITAL]
             │
             ▼ (Ambulance Arrives at ER)
   [ARRIVED_HOSPITAL]
             │
             ▼ (Handover to ER Team)
   [HANDOVER_COMPLETE]
             │
             ▼
   [CLOSED / RESOLVED]
```

### State Transitions & Permitted Actions
| Current State | Next Allowed State | Triggering Event / Action | Auth Role |
| :--- | :--- | :--- | :--- |
| `INTAKE_CREATED` | `LOCATION_CONFIRMED` | Caller/Operator confirms location | `OPERATOR`, `CITIZEN` |
| `LOCATION_CONFIRMED` | `DISPATCHING` | Dispatch engine triggered | `SYSTEM`, `OPERATOR` |
| `DISPATCHING` | `DISPATCHED` | Driver accepts dispatch offer | `DRIVER` |
| `DISPATCHING` | `LOCATION_CONFIRMED` | Offer expired or declined (re-queue) | `SYSTEM` |
| `DISPATCHED` | `EN_ROUTE_PATIENT` | Driver starts vehicle navigation | `DRIVER` |
| `EN_ROUTE_PATIENT` | `PATIENT_PICKED_UP` | Patient secured in ambulance | `DRIVER` |
| `PATIENT_PICKED_UP` | `EN_ROUTE_HOSPITAL` | Target hospital reserved & routing set | `DRIVER`, `OPERATOR` |
| `EN_ROUTE_HOSPITAL` | `ARRIVED_HOSPITAL` | Telemetry geofence / Driver manually confirms arrival | `DRIVER`, `SYSTEM` |
| `ARRIVED_HOSPITAL` | `HANDOVER_COMPLETE` | Hospital triage signs off patient handover | `HOSPITAL_STAFF`, `DRIVER` |
| `HANDOVER_COMPLETE` | `CLOSED` | Mission summary finalized | `OPERATOR`, `SYSTEM` |

---

## 3. Dispatch-Offer Lifecycle
```
  [OFFER_CREATED] (Sent to Driver via WS/FCM)
        │
        ├──► [OFFER_EXPIRED] (T_ttl = 30 seconds reached) ──► Re-trigger Dispatch Engine
        ├──► [OFFER_DECLINED] (Driver taps decline)         ──► Re-trigger Dispatch Engine
        └──► [OFFER_ACCEPTED] (Driver taps accept)           ──► Atomic DB Assignment Lock
```

- **TTL**: 30 Seconds.
- **Concurrency Protection**: Database transaction with `SELECT ... FOR UPDATE` on `Ambulance` row state `is_available` + `version` lock.
- **Fallbacks**: If all candidate vehicles decline or expire, case is flagged as `DISPATCH_ESCALATION_REQUIRED` for human supervisor override.

---

## 4. Hospital Request & Atomic Reservation Lifecycle
```
  [REQUESTED] (Control Room / Clinician sends request with required beds/equipment)
        │
        ├──► [REJECTED] (Hospital full or missing specialist)
        └──► [ACCEPTED] (Hospital accepts request)
               │
               ▼
        [RESERVED] (Atomic bed decrement in DB, 45-min reservation TTL)
               │
               ├──► [FULFILLED] (Patient Handover completed)
               └──► [CANCELLED/EXPIRED] (Rerouted or time expired -> bed restored)
```

---

## 5. Event Schema Standard
All real-time WebSocket and audit events publish JSON matching this schema:
```json
{
  "eventId": "evt-7712-4211-aa99-123456",
  "eventType": "MISSION_STATE_CHANGED",
  "aggregateId": "msn-1102-4b21-99af-012920",
  "aggregateType": "MISSION",
  "entityVersion": 3,
  "timestamp": "2026-10-06T00:08:00.000Z",
  "actor": {
    "userId": "usr-driver-101",
    "role": "DRIVER"
  },
  "payload": {
    "previousState": "EN_ROUTE_PATIENT",
    "newState": "PATIENT_PICKED_UP",
    "locationPing": {
      "latitude": 12.9716,
      "longitude": 77.5946,
      "accuracyMeters": 5.0,
      "capturedAt": "2026-10-06T00:07:55.000Z"
    }
  }
}
```

---

## 6. Uniform Error Format (RFC 7807 Problem Details)
```json
{
  "type": "https://aegis.emergency.gov/errors/DISPATCH_OFFER_EXPIRED",
  "title": "Dispatch Offer Expired",
  "status": 409,
  "detail": "The offer for mission msn-1102 expired after 30 seconds and was reassigned.",
  "instance": "/api/v1/dispatch/offers/off-9912/accept",
  "errorCode": "AEGIS_OFFER_EXPIRED",
  "timestamp": "2026-10-06T00:08:30.000Z",
  "invalidParams": []
}
```

---

## 7. Tracking Token Lifecycle
- Token generated upon intake creation: Secure random 32-char hex string (e.g. `tk_9f8a7c6b5d4e3f2a1b0c9d8e7f6a5b4c`).
- Encrypted link sent to caller via SMS: `https://aegis.gov/track/tk_9f8a7c6b5d4e3f2a1b0c9d8e7f6a5b4c`.
- Expiry: Mission `CLOSED` + 2 hours.
- Scoped permissions: Read-only access to mission state, assigned ambulance position, ETA, and emergency helpline contact. Does NOT expose driver personal phone number or hospital internal bed counts.
