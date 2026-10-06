# AEGIS branch analysis

Fetched all branches from origin. Default: main (`5ccb3a8`). All feature branches have independent root histories; ordinary ahead/behind ancestry does not apply. No source branch is overwritten.

| Branch | Features and backend | Interface and realtime | Integration decision |
| --- | --- | --- | --- |
| aegis-initial-dispatch-module (`57b4cb1`) | Spring Boot 21; PostgreSQL/PostGIS missions, assignments, telemetry, event outbox, audit. Capability/crew/readiness/freshness eligibility; version conflicts; receipt versus acknowledgement; pickup corrections; rejection/reassignment. | React dispatch console and Flutter driver; STOMP; Google Maps; JWT roles. | Preserve source, port eligibility and assignment invariants into shared authority; bridge existing wire contracts. |
| aegis-patient-tracking-v1 (`9213e8a`) | Express development adapter/proxy; hashed temporary tokens and scoped HttpOnly sessions; no production mission database. | React citizen experience; EN/TE/HI; GPS confirmation and manual pin fallback; stale-marker interpolation; scoped SSE and reconnection. | Use existing citizen components/contracts with shared persistent backend; disable independent synthetic lifecycle. |
| aegis-road-intelligence (`2721926`) | FastAPI/SQLAlchemy SQLite or PostgreSQL; YOLO, SegFormer, CLIP; bounded frame slots; temporal evidence, snapshots, transcript, PDF. | React/Vite synchronized canvas; vision WebSocket; no emergency geolocation authority. | Retain live pipeline; mount within command-room interface; registered cameras provide location, persistent road events feed routing. |
| aegis-controlroom / main (`5ccb3a8`) | Cloudflare D1 JSON city aggregate, auth/sessions, capacity/ranking, demo routes and signal logic. | Polished React command-room, hospital/citizen/driver views, Expo mobile, SSE, city-map tiles. | Preserve visual components and mobile source; replace disconnected demo state with shared API and durable lifecycle. |

## Conflicts and dependencies

README, .gitignore, root package/lock/config, .env.example, src/main.tsx and test/tooling configs collide because each branch is a standalone root. Documentation is retained under docs/branch-reference. Operational server authority must be singular; legacy Cloudflare, Java and Express adapters are retained as source references, not simultaneously started as separate mission stores.

The integrated runtime uses the existing FastAPI/SQLAlchemy database configuration (PostgreSQL supported; persistent SQLite local mode). This avoids requiring Cloudflare or PostGIS for the local acceptance demo and lets vision emit events transactionally into the same database. Spring eligibility/telemetry/outbox rules and citizen access controls are preserved in the shared service. No independent frontend arrays own mission state.

External street-routing and physical traffic-controller integrations require configured providers. Deterministic route and signal providers are explicitly simulated; their events use the same APIs as live data. Camera location is registered, never inferred from pixels.
