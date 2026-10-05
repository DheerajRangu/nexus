# AEGIS — live ambulance dispatch module

This is a new standalone codebase created separately from the old Nexus project. It owns the response workflow **after** the control room has an authorized emergency record and a patient pickup input. There is no citizen website and it never claims a call or phone number is precise GPS.

## Included

- `backend/`: Spring Boot 3.5 / Java 21 authoritative API, PostgreSQL/PostGIS Flyway migrations, direct-dispatch transaction, database integrity constraints, durable outbox/audit rows, HTTP Basic local-development security, STOMP endpoint, and telemetry validation.
- `control-room/`: React + TypeScript + Vite + Tailwind command center. It has a polished map-centered simulation adapter that works without credentials and a typed API adapter for Spring Boot. It uses buffered, timestamp-aware interpolation only between observations and honors reduced motion.
- `driver-app/`: minimal Flutter integration for confirmed assignment receipt, acknowledgement, map/navigation handoff, foreground telemetry, and arrival. It does not add an offer accept/decline interaction.
- `contracts/`: OpenAPI and versioned event envelope.
- `docs/`: operational policy and Flutter integration requirements.

## Quick start — deterministic browser demo

Requirements: Node 20+ (Node 22 recommended). From this folder:

```powershell
cd control-room
npm install
npm run dev
```

Open the URL Vite prints. With no API variables set, the header says **SIMULATION** and the browser uses the explicit local demo adapter. It demonstrates the confirmed pickup, unsuitable nearer ambulance (`AMB-A`), recommended advanced ambulance (`AMB-B`), busy (`AMB-C`), stale, off-duty, and equipment-unready vehicles. Direct dispatch, telemetry movement, pickup correction, and failure injection run through the same gateway interface as the API mode.

## Full local stack — Windows PowerShell

Install Docker Desktop, start its daemon, then:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open `http://localhost:5173`. Docker starts PostGIS on 5432 and Spring Boot on 8080. Spring migrates and seeds the deterministic fictional demonstration. The control room uses `operator` with the password from `AEGIS_OPERATOR_PASSWORD`; the demo driver is `driver-b` and uses `AEGIS_DRIVER_PASSWORD`.

For Vite development against the API, copy `control-room/.env.example` to `control-room/.env`, set the matching password, then run `npm run dev`. Current Docker static hosting cannot safely inject a changing runtime browser password; use Vite API mode for local authenticated testing.

## Test commands

```powershell
# Control room (executed in this workspace)
cd control-room
npm run build
npm test -- --maxWorkers=1 --minWorkers=1

# Backend (Maven 3.6.3+)
cd ..\backend
mvn test
docker build -t aegis-dispatch-api .
```

Executed here: `tsc -b`; Vite production build; frontend interpolation tests (2/2); and Maven backend eligibility tests (3/3). Docker Desktop's daemon and Flutter SDK were unavailable, so no container, Flyway/PostGIS integration, Android build, or physical-device execution is claimed.

## API usage

All routes are `/api/v1`. Read [openapi.v1.yaml](contracts/openapi.v1.yaml), then use Basic authentication only for this local demo. The core call is:

```powershell
$auth=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('operator:operator-demo-only'))
$snapshot=Invoke-RestMethod http://localhost:8080/api/v1/control-room/emergencies/EM-2026-001 -Headers @{Authorization="Basic $auth"}
$body=@{ambulanceId='AMB-B';entityVersion=$snapshot.entityVersion;idempotencyKey=[guid]::NewGuid()} | ConvertTo-Json
Invoke-RestMethod -Method Post http://localhost:8080/api/v1/control-room/emergencies/EM-2026-001/dispatch -Headers @{Authorization="Basic $auth";'Content-Type'='application/json'} -Body $body
```

The response is authoritative: the control room must not indicate assignment success until it receives `200`. A repeated request with the same idempotency key receives the current snapshot rather than creating a second active assignment.

## Demo walk-through

1. Reset at **Demo controls → Reset demonstration**.
2. Confirm `AMB-A` is closer but excluded by capacity/equipment/crew reasons; `AMB-C` is excluded as busy.
3. Select `AMB-B`, then **Dispatch ambulance**. This is direct backend assignment, never an offer.
4. In full-stack mode, open the Flutter driver with `driver-b`; its snapshot records app receipt. Press **Acknowledge & start navigation** to make the en-route transition; then use **Mark arrival**.
5. Change the pickup address. The server versions the correction and emits a pickup-change event; the assigned driver must separately acknowledge it through the documented endpoint.
6. Use the failure selector for routing outage, driver offline, acknowledgement timeout, stale GPS, and equipment failure states.

## Deliberate boundaries

This is a connected first module, not a production emergency-service deployment. It has no actual 108 integration, approved identity provider, live Google/traffic routing, FCM delivery, production broker, actual driver background tracking validation, or clinical protocol approval. See [OPERATIONS.md](docs/OPERATIONS.md) and [DRIVER-INTEGRATION.md](docs/DRIVER-INTEGRATION.md) before connecting external systems.
