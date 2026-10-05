# AEGIS · Emergency intelligence network

A responsive full-stack hackathon application that coordinates **SOS → ambulance → appropriate hospital → route → green corridor → patient arrival**. The default view is the emergency command center. All infrastructure, medical support rules, travel estimates, and outcome metrics are explicitly simulated.

## Run locally

Requires Node.js 22.13+.

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_crazy_quentin_quire.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_real_fallen_one.sql
npm run start
```

Apply each migration once to a fresh local database. Open the URL printed by Wrangler (normally http://127.0.0.1:8787). `npm run dev` provides frontend development; use the built Worker for database-backed integration testing.

## Native mobile app

The Android/iOS Expo app and its separate [native setup guide](mobile/README.md) live in [`mobile/`](mobile/). It uses Google Maps through `react-native-maps` 1.29.11, whose Expo plugin injects the platform-specific Maps SDK configuration. Follow the guide to configure restricted Maps keys and a reachable AEGIS API origin before creating a native build.

## Demo

Click **Start demo** on the command center. This opens the synthetic Administrator session and starts a roughly 45-second scenario. The engine selects A-07 for its advanced trauma and neurocritical equipment, rejects the closest hospital because of ICU/specialist availability, reserves an ICU bed at Manipal, coordinates five junctions, introduces a roadblock, reroutes, prepares the hospital, and completes arrival. The demo resets the shared synthetic network.

The avatar opens the seven role-specific demo workspaces. Citizen, Driver, Paramedic, Hospital Staff, Traffic Officer, Emergency Operator, and Administrator have different views and server permissions. Demo professional accounts are intentionally selectable because they operate only synthetic data. Registered Citizen accounts have separate server-backed city state and cannot escalate roles or access the shared demo's records.

## Architecture

- React 19, TypeScript, Next App Router conventions, Vinext and Tailwind CSS; a Cloudflare Worker-compatible build.
- REST actions and server-sent events for shared state updates, with a 2-second polling fallback. No WebSocket server is included.
- Cloudflare D1 / SQLite, Drizzle schema and versioned SQL migrations. PostgreSQL, Express, and Redis are not required for this deployment.
- JWT HS256 authentication in HttpOnly, SameSite cookies; Secure cookies on HTTPS. Tokens expire after 24 hours and server-side session records support revocation. Roles are read from the database, not trusted from client input.
- Salted PBKDF2-SHA256 password hashing; validation; origin checks; authentication rate limiting; server-side authorization; private account isolation; persisted audit logs.
- City state aggregates emergencies, patients/vitals, ambulances, hospitals/resources, routes, traffic signals, road segments, incidents, green corridor state, recommendations, and notifications. A revision-based compare-and-swap update with atomic D1 batches prevents simultaneous allocation of the same bed or vehicle. Audit records retain before/after snapshots. User accounts, sessions, profiles, JWT signing keys, and audit records have dedicated relational tables.

`src/features/engine.ts` contains the Emergency, Patient, Ambulance, Hospital, Route, Resource, Green Corridor, and Monitoring service logic. Hospital suitability uses six administrator-configurable weights totaling 100%, with required resource/capability eligibility preceding score ranking. Every major operation changes persistent server state.

## Implemented workflows

- Seeded network: 10 ambulances, 6 hospitals, 20 junctions, 30 road segments, resource availability, incidents, and sample history.
- Emergency creation, SOS countdown with cancellation, automated dispatch and explainable hospital ranking.
- Three route alternatives, route acceptance, animated movement along a route, green-wave simulation, signal overrides, roadblock rerouting, disaster simulation, and time-saved estimates.
- Atomic ICU reservation transfer on hospital override; arrival changes reserved resources to occupied, releases the ambulance, and restores signals.
- Paramedic vitals updates and rule-based severity support, clinical observations, hospital handoff, and incremental readiness preparation.
- Hospital resource management, incoming patient views, mass casualty allocation planning, predictive sample analytics, charts, and demand forecasts.
- Role-specific responsive dashboards, marketing page, splash/onboarding, email registration/login, simulated phone OTP, private medical profile and emergency contacts, notifications, decision timeline, audit view, and downloadable JSON incident reports.
- Simulated low connectivity preserves the last received screen and form inputs; actual disconnection disables submission. This is not a persistent offline synchronization queue.
- Driver text-to-speech commands when supported by the browser.

## Checks

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/engine.test.mjs
# Start the local Worker first:
node --test tests/api.test.mjs
```

Engine checks cover equipment matching, closest-hospital rejection, reservation transfers, full-ICU rejection, arrivals, demo reroutes, and unique allocations. API checks cover RBAC, malformed inputs, cross-role patient handoff, concurrent reservations, account isolation, and origin protection.

## Prototype boundaries

This is a functional presentation prototype, not a production emergency dispatch or medical system. It does not contact emergency services, operate real signals, diagnose patients, or guarantee transport/treatment outcomes. Confidence values are labeled sample simulation indicators, not calibrated clinical confidence.

Routes and travel estimates use deterministic simulation models rather than live road-network routing. Street-map tiles are fetched from OpenStreetMap for the visible viewport; all markers and traffic events are simulated. No offline tile download is offered. For production usage, configure a dedicated tile/routing provider and real GPS/traffic/hospital integrations. [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).

Phone OTP is a UI simulation (code 123456); real SMS and password-recovery email delivery are not connected. Real professional account provisioning, verified institutional identities, clinical validation, granular institutional tenancy, production observability, and disaster communications remain future integration work. The native Expo app uses the same simulated city data and currently requires a separately reachable authorized API origin.

WebMCP tools are feature-detected for reading role-authorized state, navigating role-authorized views, and starting an Administrator demo. They use the same application APIs; unsupported browsers continue normally. A supported WebMCP execution context was unavailable during local validation.
