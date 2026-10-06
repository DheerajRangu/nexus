# Realtime events

Every mutation commits its city revision and new outbox events together. `/api/ecosystem/events` sends named `state` events with an SSE revision ID and a role-scoped authoritative snapshot. Browser EventSource reconnects automatically; reconnect sends current state immediately. Durable timelines retain intermediate transitions even when several happen within one transaction. This stream reconciles snapshots rather than promising exactly-once incremental event delivery.

Citizen `/api/v1/citizen/events` preserves its restricted v1 contract and version checks. Driver GPS sequence and timestamp checks reject stale/duplicate uploads. Native Flutter consumes shared SSE with snapshot polling recovery; Expo consumes shared SSE and refreshes its compatible projection, with foreground polling recovery. Nginx response buffering is disabled.

| Event family | Subscribers / effect |
|---|---|
| incident.created / updated; dispatch.unavailable | Command room, assigned role views, citizen phase projection |
| ambulance.assigned / driver.notified / assignment.received / assignment.accepted / assignment.rejected / acknowledgement.overdue | Dispatch and driver; citizen sees accepted assignment only |
| ambulance.location.updated; route.eta.updated | Command map, driver route, hospital ETA, citizen accepted marker/ETA |
| patient.arrived / picked_up / severity.updated | Driver, command room, selected hospital; hospital ranking changes |
| hospital.rankings.updated / selected / accepted / rejected / capacity.updated | Hospital, dispatch, driver; capacity loss triggers diversion |
| road.event.detected / route.impacted; camera.event.detected | Command room; intersecting journeys reroute |
| route.created / rerouted / blocked | Driver, command room, hospital ETA and citizen route |
| green_corridor.updated / activated / completed / cancelled | Signal view and route/corridor lifecycle |
| ambulance.arrived.at.hospital; patient.handover; emergency.completed / cancelled | Final shared phase; resources released |

Event envelope: eventId, type, incidentId (optional), occurredAt (UTC), details. Citizen snapshots omit clinical fields. Reconnect does not reconstruct status from frontend timers or demo arrays.
