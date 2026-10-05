# AEGIS operational contracts

## State and permissions

| Transition / fact | Authority | Rule |
|---|---|---|
| `CREATED → LOCATION_PENDING → READY_FOR_DISPATCH` | Shared authorized incident workflow | This module consumes the confirmed pickup input; it does not acquire a caller's GPS. |
| `READY_FOR_DISPATCH → ASSIGNED` | Operator / authorized policy | Backend locks and rechecks candidate eligibility, then creates a single active assignment. |
| Assignment receipt | Driver app | Proves only the app received assignment data. |
| `ASSIGNED → EN_ROUTE_TO_PATIENT` | Assigned driver | Explicit acknowledgement; never a push delivery or map-opening side effect. |
| `EN_ROUTE_TO_PATIENT → AT_PATIENT` | Assigned driver | Explicit arrival transition. |
| Reassignment | Authorized operator | Supersedes the former active assignment atomically; old driver cannot transition it. |

There is deliberately no accept, decline, offer expiry, or offer countdown state.

## Candidate policy

Eligibility is deterministic: active driver shift, `AVAILABLE` status, no conflicting active assignment, fresh location, vehicle/equipment/crew readiness, maintenance clear, required capacity, equipment set, and crew capability set. Geographic distance only supports ranking; it is not displayed as a road ETA. The demo has nearer `AMB-A` excluded for missing capabilities, `AMB-B` recommended, and `AMB-C` excluded because it is busy.

The local routing adapter is explicitly approximate; it is not traffic-aware. If routing is unavailable the snapshot says so and never fabricates route geometry or a realistic ETA. Add a backend-only supported routing adapter before live use.

## Telemetry policy

Each update requires `ambulanceId`, tracking session UUID, monotonically increasing sequence, UTC capture time, coordinate, accuracy, and schema version. The backend verifies driver-to-vehicle association, accepts timestamps only within the configured past/future window, rejects duplicate/out-of-order points in a session and older buffered points across sessions, and flags implausible movement above 55 m/s. It records latest accepted location and sends a durable event. The map client buffers observations, interpolates only between them, honors reduced motion, and stops at last known position when stale.

## Real time / reliability

The API persists an outbox row in the same transaction as operational mutations and publishes a STOMP message on `/topic/aegis.{aggregateType}.{aggregateId}`. Event consumers must deduplicate by `eventId`, reject lower `entityVersion`, and refresh the authoritative snapshot after reconnect. The control-room client currently has a 2-second authenticated snapshot polling fallback; it is intentionally safe when a WebSocket is unavailable.

## Role matrix

`OPERATOR`/`ADMIN`: control-room read, direct dispatch, correction, reassignment, demo tools. `DRIVER`: only own vehicle telemetry, own current-assignment snapshot, receipt, acknowledgement, pickup-change acknowledgement, operational problem, and arrival. Database checks remain authoritative beyond HTTP roles.

## Google / Firebase setup

Enable billing on the Google Cloud project. For the web map enable **Maps JavaScript API** and restrict `VITE_GOOGLE_MAPS_BROWSER_KEY` by HTTP referrer. For Android enable **Maps SDK for Android** and restrict its separate key by Android package and SHA-1. For server route calculations enable **Routes API** and place only its key in `GOOGLE_MAPS_SERVER_KEY`; restrict it by server egress/IP where possible. Geocoding or Places use needs their respective APIs and should be enabled only if actually configured. Never commit keys.

FCM is intentionally not configured by this local client. The backend has token registration/removal endpoints; a production implementation must use Firebase Admin credentials exclusively on the server, send minimal notification data, and fetch sensitive assignment details after authentication. Push delivery is never an acknowledgement.
