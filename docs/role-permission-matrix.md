# AEGIS Role & Permission Matrix

| Role Code | Role Name | System Access Scope | Key Capabilities |
| :--- | :--- | :--- | :--- |
| `ROLE_SUPERVISOR` | Control Room Supervisor | System-wide | View all city active cases, override auto-dispatch, set roadblocks, manage green corridors, trigger system resets, inspect audit logs & analytics |
| `ROLE_OPERATOR` | 108 Call Intake Operator | Operational Intake & Dispatch | Process inbound call webhooks, manual intake, confirm caller/patient location, trigger candidate ambulance shortlist & dispatch offers |
| `ROLE_DRIVER` | Ambulance Driver | Assigned Mission Only | Receive dispatch offers, accept/decline offers, broadcast location pings (GPS telemetry), update mission stage (`EN_ROUTE`, `PATIENT_PICKED_UP`, `ARRIVED`) |
| `ROLE_HOSPITAL_STAFF` | ER Clinician / Admin | Hospital Portal | View incoming emergency patient requests, confirm bed/ICU/equipment availability, accept/reject atomic bed reservations, confirm patient handover |
| `ROLE_CITIZEN` | Public Caller (Token Scoped) | Secure Token View Only | Confirm exact location via browser GPS, view assigned ambulance live tracking, view real-time travel ETA |
| `ROLE_AI_SERVICE` | Internal Microservice | Non-mutating Recommendation | Read un-triaged intake notes for NLP structuring, calculate ETA corrections, return ranked candidates with rationale. Cannot mutate DB records directly |

## Security Controls
1. **JWT Authentication**: Bearer token authentication with role claims & entity scope (`hospitalId` or `ambulanceId`).
2. **Method-Level Security**: `@PreAuthorize("hasRole('OPERATOR')")` on Spring Boot REST controllers.
3. **Database Row-Level Isolation**: Drivers can only query `/api/v1/driver/mission/active` matching their `userId` or `ambulanceId`.
4. **Token Security**: Public tracking URL requires valid cryptographic `trackingToken`. Rate-limited to 60 requests/min per IP.
