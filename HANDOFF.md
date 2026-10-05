# AEGIS module handoff

## What was completed

The new `aegis/` folder is independent from `aegis-repo/` (the old cloned Nexus repository was inspected but not edited). The module includes a Spring Boot/PostGIS operational foundation, direct assignment state machine, demo database seed, React command center, Flutter driver integration starter, and contracts.

## Key extension points

- Replace `SecurityConfig`'s local HTTP Basic users with the shared identity/session issuer; preserve server-side role and vehicle association checks.
- Keep `DispatchService` as the only assignment authority. Do not create a separate driver-owned assignment service or an accept/decline state.
- Implement a supported server-side routes adapter behind the current demo approximate route logic. Browser keys must never be used by the backend.
- Replace `EventOutbox`'s in-process STOMP send with a transactional outbox publisher/consumer suitable for the shared broker; retain the outbox schema and event envelope.
- The UI has an explicit local visual map adapter. Add a Google Maps adapter only behind its key/configuration boundary; preserve the persistent SIMULATION label for demo data.
- Complete Flutter foreground/background tracking only with policy-approved libraries, platform declarations, bounded encrypted queue, restart recovery, and physical device tests.

## Database invariants

`assignments` has partial unique indexes preventing multiple active assignments per mission, ambulance, and driver. The dispatch service locks the mission and ambulance, rechecks every eligibility criterion within the transaction, writes assignment/vehicle/mission/audit/outbox records together, and accepts an idempotency key. Reassignment supersedes the former assignment before it creates the replacement.

## Contract semantics

`assignment.confirmed`, `assignment.received`, and `assignment.acknowledged` are three different events. FCM delivery would only be a transport signal, never receipt or acknowledgement. Clients must deduplicate `eventId`, track `entityVersion`, and retrieve a snapshot after reconnect.

## Known gaps to address before live integration

- Add actual JWT/OIDC and revocation against the shared identity provider.
- Add migration/integration tests on real PostgreSQL/PostGIS plus concurrent transaction tests; current included backend tests target eligibility logic only.
- Add provider rate limiting, timeout/backoff/cache policy, Google Routes integration, provider-health probes, and route recalculation thresholding.
- Add FCM Admin sender, token lifecycle worker, authenticated STOMP CONNECT interceptor, broker authorization, and cross-instance event fan-out.
- Add pickup-change acknowledgement status to the control-room projection and push it to both clients.
- Add an authenticated operator workflow for resolving driver operational problems and authorized reassignment reason capture in the UI.
- Conduct security review, retention policy implementation, audit export policy, load testing, accessibility review, and real-device Android/iOS validation.
