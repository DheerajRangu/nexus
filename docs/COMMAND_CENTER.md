# Hyderabad command center

The default `/control-room` now uses the shared FastAPI/SQLAlchemy authority with cookie-authenticated `/ws/command` updates and embedded Python vision. This backend choice follows the request to use the best approach: no competing Node mission store. Zustand holds UI selection/view state; TanStack Query handles bootstrap and actions; Framer Motion and requestAnimationFrame animate feedback and markers.

## Start

```sh
npm ci
npm run dev
```

The launcher reuses a healthy backend or starts the repository's Python virtualenv API on 8000, then Vite on 5173. A clean checkout must first create `.venv`, install `requirements.txt`, and prepare models for actual vision (see SETUP.md). City simulation requires no PostgreSQL, Redis, Google key or camera. SQLite persists the same city state. Set AEGIS_API_ORIGIN for another API; npm run dev:web starts only Vite.

Open http://localhost:5173/control-room and enter the command demo. An empty city initializes Hyderabad automatically. Start demo initializes an existing empty/inactive network. Reset requires confirmation and refuses active incidents outside this command simulation.

## Working controls

- Seed: 22 ambulances, 12 demo hospitals, 18 cameras, 6 incidents, 8 road findings and 2 corridors. All capacity/name data is labeled demonstration data.
- Server simulation: GPS, acceptance, arrival, pickup, hospital acceptance, signals and handover use shared lifecycle services. Persistent controls: pause, 1X/2X/5X, automatic progression and chaos.
- Operator intake: location, confirmed severity, patient count and notes produce ranked candidates. Accept AI dispatch or select an eligible unit. Ineligible selections fail server-side. Heuristic ranking is not a calibrated probability.
- Map: Google display if configured; labeled geographic grid otherwise. Layers filter markers. Units interpolate; routes, disruption regions and signal windows consume shared state. Click markers for details.
- Ctrl/Cmd+K searches incidents, units, hospitals, cameras and road events; selects/focuses results. Panels collapse, browser fullscreen maximizes operations.
- Operator actions: pending reassignment, cancellation, hospital selection, corridor activation/release, route recomputation, pre-arrival alert and driver contact request. Actions are audited in timelines. Accepted transport cannot be silently reassigned.
- Demo events: accident, cardiac, congestion, blockage, construction, ICU-full diversion, camera alert, multiple incidents and corridor. Road clearance calls the shared road API.
- Camera drawer: simulated sensor view clearly labeled, alongside actual video/browser-camera/CCTV inference, evidence, transcript and printable report. Simulated detections never masquerade as model observations.
- Alerts: acknowledge, mute, resolve, open source. Notifications are in-app. Contact requests do not claim SMS/WhatsApp delivery.
- Analytics derives counts from state/history. Health reports actual backend status and labels demo providers. Optional quiet audio requires opt-in; reduced-motion CSS suppresses visual effects.

## API and security

POST /api/demo/start, /api/demo/reset, /api/demo/event; PATCH /api/demo/control; GET /api/system/health; POST /api/command/incidents/{id}/{action}; POST /api/command/alerts/{eventId}/{action}; WS /ws/command.

GET /api/demo/resources lists demo login resources; GET /api/cameras and /api/ambulances/{id} respect operator/resource scopes. POST /api/ambulances/{id}/status switches idle units between AVAILABLE and OFFLINE. POST /api/corridors and DELETE /api/corridors/{id} activate/release corridors through the shared lifecycle.

Command role and resource scopes remain server-side. WebSocket origin/expiry checks, mutation rate limiting and response headers are added. Driver, citizen and hospital routes retain their shared APIs. Original operations UI is available at /legacy-operations for compatibility testing.

## Verification

npm run test; npm run lint; npm run build. Backend tests: tests/test_command.py. Browser acceptance: tests/command-flow.cjs. Use an isolated city database and AEGIS_COMMAND_URL; never a production city. Screenshots/results: /tmp/aegis-command-flow.

External street routing, physical signals, per-user production identity, and real message delivery remain provider integrations. No survival benefit or calibrated diagnosis is asserted.
