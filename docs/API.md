# Shared API

Interactive schema: `http://localhost:8000/docs`; machine schema: `/openapi.json`. Browser requests use HttpOnly cookies; native requests use the same opaque session token as a Bearer token. Server checks role and ambulance/hospital resource ownership. Never use a UI role selector as an authorization check.

| Endpoint | Purpose / actor |
|---|---|
| POST /api/auth/session | Scoped operational bootstrap; role/resource/key |
| DELETE /api/auth/session | Revoke session |
| GET /api/ecosystem/state | Authoritative role-scoped snapshot |
| GET /api/ecosystem/events | Scoped SSE; revision ID, state event |
| POST /api/demo/seed | Command room only; refuses active incidents |
| POST /api/incidents | Demo citizen intake with confirmed location and idempotent submissionId |
| GET /api/incidents/{id} | Scoped incident |
| GET /api/incidents/{id}/timeline | Durable incident history |
| POST /api/incidents/{id}/dispatch | Dispatch / retry escalation |
| POST /api/assignments/{id}/receipt, acknowledgement | Assigned driver only; both record delivery facts and cannot change a confirmed assignment |
| POST /api/ambulances/{id}/location | Monotonic sequence, UTC timestamp, location, heading, speed |
| POST /api/incidents/{id}/arrived-patient, pickup, assessment, arrived-hospital | Assigned driver |
| POST /api/incidents/{id}/select-hospital, reroute, cancel | Command room |
| POST /api/incidents/{id}/hospital-accept, hospital-reject, handover | Selected hospital |
| PATCH /api/hospitals/{id}/capacity | Hospital capacity/capability; reranks and diverts |
| POST /api/road-events | Located operator/demo road evidence |
| PATCH /api/road-events/{id} | Clear active finding and reevaluate route |
| POST /api/cameras | Registered location and road name |
| POST /api/live/sessions | Existing vision session; optional authenticated cameraId |
| WS /ws/vision/{id} | Synchronized inference frame/image/metadata |
| POST /api/v1/citizen/sessions | Exchange expiring tracking link for restricted cookie |
| GET /api/v1/citizen/tracking, events | Clinical-free snapshot / SSE |
| POST /api/v1/citizen/location | Versioned pickup correction before pickup |
| GET /api/v1/driver/me/snapshot | Flutter projection from shared city |
| POST /api/v1/driver/assignments/{id}/{action} | Flutter receipt/acknowledgement/pickup actions |
| POST /api/v1/driver/telemetry | Flutter GPS enters shared telemetry endpoint |
| GET /api/state; POST /api/auth, /api/action | Preserved Expo compatibility, same authority |

Lifecycle actions validate current status. Optional expectedVersion prevents stale edits. Illegal transitions/old GPS produce 409, unauthorized ownership 403, expired session 401, invalid input 422. No eligible ambulance/hospital produces persisted critical escalation, not invented availability.

Anonymous citizen creation is enabled only in demo mode. Outside demo, operational bootstrap requires AEGIS_OPERATOR_KEY; a production citizen admission/account provider has not been implemented. The legacy native account registration UI is disabled. Demo intake never calls emergency services.
