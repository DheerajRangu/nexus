# Citizen tracking events 1.0.0

Real-time updates use server-sent events at `GET /api/v1/citizen/events`.

The session cookie scopes the stream to one `emergencyId`. The stream never includes another emergency, fleet positions, hospital internals, or clinical records.

## Frame

```
id: <sequence>
event: <type>
data: <TrackingEvent JSON>
```

`sequence` is monotonic per emergency. Clients send `Last-Event-ID` on reconnect. The server replays retained events with a greater sequence, then continues live.

Heartbeat comments (`: ping`) are not events.

## Event types

| type | entity | when |
| --- | --- | --- |
| `mission.updated` | `mission` | phase, delay, cancellation, completion, access window |
| `assignment.changed` | `assignment` | ambulance assigned or replaced |
| `telemetry.position` | `telemetry` | a new ambulance observation, including a stale one |
| `route.updated` | `route` | route path replaced |
| `hospital.changed` | `hospital` | confirmed hospital destination changes |
| `location.updated` | `location` | caller confirms or corrects the pickup point |
| `session.expired` | `session` | access policy or session end; `snapshot` is null |

## Ordering

Each incremental event carries the full citizen `TrackingSnapshot` after that change.

- `stateVersion` increases by exactly 1.
- `versions[entity]` increases by exactly 1.
- Duplicates and older versions are ignored.
- A jump greater than 1 is a gap. The client discards the event and reloads `GET /api/v1/citizen/tracking`.
- An event whose `emergencyId` does not match the loaded snapshot is rejected.
- `GET /api/v1/citizen/tracking` is authoritative and may jump versions.

## Stale telemetry

`telemetry.stale` is true when the observation is older than `staleAfterSeconds`, or when the producer explicitly marks it stale. Clients stop interpolation and show the last-known position. They do not invent the next point.

## Time

`occurredAt`, `observedAt`, `serverTime`, and `estimatedArrivalAt` are UTC ISO-8601. The website formats them in the viewer’s local zone.
