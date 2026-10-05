# AEGIS citizen / patient tracking

Mobile-first website for a caller who opens a secure SMS link. There is no install and no account.

Spring Boot is the system of record for emergencies, missions, assignments, hospital confirmation, and tracking sessions. This repository does not create a mission database and does not dispatch ambulances.

No OpenAPI file was present in the workspace, so the citizen contract is defined here:

- `contracts/citizen-tracking-v1.openapi.yaml`
- `contracts/events.md`
- `shared/contract.ts`
- `contracts/token-storage.sql` (token hashes only, for the shared AEGIS PostgreSQL database)
- `config/integration.json`

## Development adapter

`server/` is a **development adapter**. Every mission it creates is synthetic (`synthetic: true`, reference `AG-DEMO-…`). It stores token SHA-256 hashes in memory. It is not the AEGIS mission database.

| `ADAPTER_MODE` | Behavior |
| --- | --- |
| `development` (default) | Synthetic lifecycle and demo routes. A configured backend URL is ignored. |
| `proxy` | Forwards `/api/v1/citizen` to `AEGIS_BACKEND_BASE_URL`. Demo routes return `DEMO_DISABLED`. If Spring Boot is down, the response is `UNAVAILABLE`. The adapter does not invent a live mission. |

## Run

```bash
npm install
copy .env.example .env
npm run dev
```

Open the labelled demonstration at [http://localhost:5173/demo](http://localhost:5173/demo).

Confirm a pickup point. The synthetic mission then moves through assignment, approach, pickup, hospital travel, arrival, and completion. The amber banner stays visible. Demonstration estimates are labelled and are not live routing.

An SMS-shaped link is `POST /api/v1/citizen/sessions` with `{ "linkToken" }`. The page reads `/t/<token>` once, removes it from the address bar, and keeps only an HttpOnly session cookie.

## Maps

Set `VITE_GOOGLE_MAPS_API_KEY` to a **browser** key restricted by HTTP referrer, with the Maps JavaScript API enabled. The page sends the origin only, not the token path.

Without a key, the page uses a local map preview and the adapter’s labelled address suggestions.

## Contract

Session cookie: `aegis_cts`.

- `POST /sessions` exchanges a link token
- `GET /tracking` returns one emergency
- `POST /location` confirms or corrects the pickup
- `GET /events` is the scoped event stream
- `POST /contacts/control-room` and `POST /contacts/driver`
- `POST /demo/sessions` and `POST /demo/advance` exist only on the development adapter

A query `emergencyId` that does not match the session returns `403 CROSS_MISSION_DENIED`.

Times in the API are UTC. The page shows them in the viewer’s local time. The interface is English, Telugu, and Hindi.

After an ambulance is assigned, a pickup change alerts the control room and the driver and does not change the hospital. The phone’s GPS fix is not the pickup point unless the caller confirms that pin.

Ambulance markers animate only between recent observations. A stale fix stays put and is labelled as the last-known position.

## Tests

```bash
npm test
```

Covers location denial, pickup correction, assignment changes, stale telemetry, reconnect recovery, invalid and expired tokens, and cross-mission denial.

## Production

Serve the Vite build over HTTPS. Set `COOKIE_SECURE=true` on the citizen API. Spring Boot implements the same contract, stores only token hashes, and scopes each session to one emergency. Do not add analytics that can see the tracking URL. Do not put clinical records on this page.
