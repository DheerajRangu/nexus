# Hospital emergency receiving center

Open http://localhost:5173/hospital. The new interface replaces the hospital capacity-only view; `/legacy-hospital` preserves the original workspace. Run `npm run dev` after Python setup in SETUP.md.

Choose a receiving hospital and staff role. In demo mode, select a trauma-capable hospital with free ICU capacity (HOSP-B on the original seed, or the Hyderabad hospitals). Click **Start hospital demo**. The shared backend runs the 82-second trauma receiving scenario; speed 1×/2×/5× and pause operate on persisted server state.

The new center provides incoming patient selection, vitals and demo traces, moving GPS/map, ETA, preparation checklist, readiness gauge, team assembly, blood inventory, resource locks, live department layout, corridor status, in-app command/team channels, alerts, MIST handover, hospital patient board, capacity outlook, acceptance policies, diversion, mass casualty mode, search and audit history.

Hospital preparation reserves resources atomically by patient. Repeat requests do not consume blood twice. Unavailable resources produce conflicts instead of invented successful reservations. Diversion/cancellation releases future reservations. Confirmed handover changes locked resources to in-use, releases the ambulance, completes the corridor and records hospital ownership. Patient receipt requires arrival, a started handover, and confirmed patient/vitals/documentation checks.

The 82-second scenario creates a dedicated demo ALS unit and uses shared dispatch, hospital acceptance, corridor, road-event and handover services. Demo movement and vitals are labeled. The temporary demo obstruction is explicitly cleared during recovery; live blocked roads are not silently cleared. The anesthetist conflict exposes substitution, followed by the simulated staff response. Pausing stops the scenario clock.

Roles are checked on the server: Viewer is read-only; Commander/Admin control availability, acceptance policies, mass casualty and simulation; clinical receiving roles may confirm handover; Radiology is limited to imaging actions and messages; Blood Bank to blood reservations and messages. Existing hospital sessions remain compatible. Production access uses the platform's configured operator key; enterprise per-user identity remains a separate provider integration.

## Architecture

The connected FastAPI/SQLAlchemy backend remains the single source of truth, as previously authorized. `/api/hospital-command/session` binds a hospital/staff role to the existing operator cookie. `/api/hospital-command/{hospitalId}` reads scoped operations. POST `/api/hospital-command/{hospitalId}/{action}` supports prepare, reserve, acknowledge, divert, team-ready, substitute, resource-status, message, alert-ack, policy, diversion, mass-casualty, handover-start, handover-save, receive, demo-start and demo-control. Cookie-authenticated `/ws/command` sends scoped revisions. Zustand contains frontend view/snapshot state; TanStack Query executes actions; `HospitalSimulationEngine.ts` calls the server. No second Node/Prisma mission authority was introduced.

## Data boundaries

Hospital equipment, staffing and blood stock are demonstration data unless manually configured; external HIS, blood-bank systems, pagers, ECG devices and physical signals are not claimed connected. Clinical preparation is decision support, not diagnosis or treatment authorization. Readiness is checklist completion. Capacity outlook uses known assignments and committed beds, not an invented future-arrival forecast. Time saved remains unreported without a measured baseline. No hardcoded survival benefit or fake delivery/latency appears.

## Verification

Backend tests in `tests/test_hospital_command.py` cover the shared demo lifecycle, deterioration, resource locks/idempotency, cross-hospital scope and staff permissions. Run `npm run test`, `npm run lint`, and `npm run build`. Browser verification artifacts are in `/tmp/hospital-*.png` and `/tmp/hospital-browser-results.json`; use an isolated database when replaying the demo.
