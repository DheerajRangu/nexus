# AEGIS data dictionary (MVP)

| Field / entity | Meaning | Source |
|---|---|---|
| emergencyId | Case id | Intake |
| missionId | Assigned response lifecycle | Dispatch accept |
| ambulanceId | Vehicle unit | Seed / fleet |
| hospitalId | Destination facility | Seed / hospital service |
| offerId | Driver dispatch offer | Dispatch engine |
| reservationId | Bed hold | Hospital reserve |
| eventId | Outbox / domain event id | OutboxService |
| entityVersion | Monotonic version per aggregate | JPA `@Version` / envelope |
| occurredAt | Event time (UTC ISO-8601) | Outbox envelope |
| aiStatus | `OK` or `FALLBACK` | AIServiceClient |
| tracking token | Citizen link; SHA-256 stored only | CitizenTrackingService |
| reservedBeds | Held beds (CHECK ≤ available) | Hospital reserve |
| RouteVersion | Persisted route when ETA delta exceeds threshold | RoutingService |
| SIMULATED | Demo routing / graph label | RoutingProvider / RoadGraphProvider |

All operational seed rows and AI training rows used in this repo are synthetic.
