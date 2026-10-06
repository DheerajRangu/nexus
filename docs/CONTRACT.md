# AEGIS contract

Illegal transitions return HTTP 409 `application/problem+json`.

## IDs

| Name | Meaning |
|---|---|
| emergencyId | Emergency case |
| missionId | Mission lifecycle |
| ambulanceId | Ambulance |
| hospitalId | Hospital |
| eventId | One outbox/domain event |

Timestamps are UTC ISO-8601.

## Mission

| from | to | who | side effects | event |
|---|---|---|---|---|
| CREATED | DISPATCHING | OPERATOR, SUPERVISOR | offers may be created | mission.dispatching |
| DISPATCHING | ASSIGNED | DRIVER (accept), OPERATOR, SUPERVISOR | exactly one assignment | mission.assigned |
| ASSIGNED | EN_ROUTE_TO_PATIENT | DRIVER (own mission), OPERATOR, SUPERVISOR | route version recorded | mission.en_route |
| EN_ROUTE_TO_PATIENT | ON_SCENE | DRIVER (own), OPERATOR, SUPERVISOR | timeline entry | mission.on_scene |
| ON_SCENE | TRANSPORTING | DRIVER (own), OPERATOR, SUPERVISOR | destination must be reserved or operator-confirmed | mission.transporting |
| TRANSPORTING | AT_HOSPITAL | DRIVER (own), OPERATOR, SUPERVISOR | arrival timestamp | mission.at_hospital |
| AT_HOSPITAL | HANDED_OVER | HOSPITAL_STAFF (own hospital), OPERATOR, SUPERVISOR | reservation consumed | mission.handed_over |
| HANDED_OVER | COMPLETED | OPERATOR, SUPERVISOR | assignment closed | mission.completed |
| CREATED, DISPATCHING | CANCELLED | OPERATOR, SUPERVISOR | open offers withdrawn | mission.cancelled |
| CREATED, DISPATCHING | ESCALATED | OPERATOR, SUPERVISOR, system | escalation alert | mission.escalated |
| DISPATCHING | CANCELLED | OPERATOR, SUPERVISOR | offers withdrawn | mission.cancelled |

Any other pair is illegal.

## Offer

| from | to | who | side effects | event |
|---|---|---|---|---|
| OFFERED | ACCEPTED | DRIVER (offered ambulance) | one assignment; sibling offers withdrawn | offer.accepted |
| OFFERED | DECLINED | DRIVER (offered ambulance) | next ambulance offered or escalation | offer.declined |
| OFFERED | EXPIRED | system job | next ambulance offered or escalation | offer.expired |
| OFFERED | WITHDRAWN | OPERATOR, SUPERVISOR, system | no assignment | offer.withdrawn |

## Reservation

| from | to | who | side effects | event |
|---|---|---|---|---|
| REQUESTED | ACCEPTED_BY_HOSPITAL | HOSPITAL_STAFF (own hospital) | eligibility already filtered | reservation.accepted |
| ACCEPTED_BY_HOSPITAL | RESERVED | HOSPITAL_STAFF (own), OPERATOR | beds reserved atomically | reservation.reserved |
| RESERVED | CONSUMED | HOSPITAL_STAFF (own), OPERATOR | reserved count released into consumed | reservation.consumed |
| REQUESTED | REJECTED | HOSPITAL_STAFF (own) | no bed change | reservation.rejected |
| REQUESTED, ACCEPTED_BY_HOSPITAL, RESERVED | RELEASED | OPERATOR, SUPERVISOR, HOSPITAL_STAFF (own) | reserved beds returned | reservation.released |
| REQUESTED, ACCEPTED_BY_HOSPITAL | EXPIRED | system | no bed held | reservation.expired |

Destination change after RESERVED requires OPERATOR or SUPERVISOR confirmation and an AuditEvent.

## Tracking token

| from | to | who | side effects | event |
|---|---|---|---|---|
| ISSUED | ACTIVE | CITIZEN (first valid use) | hash lookup only | tracking.activated |
| ISSUED, ACTIVE | EXPIRED | system | HTTP 410 | tracking.expired |
| ISSUED, ACTIVE | REVOKED | OPERATOR, SUPERVISOR | HTTP 410 | tracking.revoked |

Token is 256-bit random. Only SHA-256 is stored.

## Role x endpoint group

| group | SUPERVISOR | OPERATOR | DRIVER | HOSPITAL_STAFF | CITIZEN |
|---|---|---|---|---|---|
| auth | yes | yes | yes | yes | no |
| intake / cases | yes | yes | no | no | no |
| dispatch / offers | yes | yes | own mission/offer | no | no |
| missions read | all | all | own assignment | own hospital destination | token only |
| hospitals / reservations | yes | yes | no | own hospital | no |
| roadblocks | yes | yes | no | no | no |
| tracking | issue/revoke | issue/revoke | no | no | own token |
| demo | yes | yes | no | no | no |
| snapshot / ws | yes | yes | own | own hospital | token topic |

## RFC 7807

| field | value |
|---|---|
| type | `about:blank` or a stable URI |
| title | short status text |
| status | HTTP status |
| detail | human-readable cause |
| instance | request path |
| Content-Type | `application/problem+json` |

401 bad signature. 403 wrong role or scope. 409 illegal transition or lost race. 410 expired or revoked token.

## Event envelope

| field | rule |
|---|---|
| eventId | unique id |
| type | dotted name from the tables above |
| aggregateId | emergencyId, missionId, or reservation id |
| entityVersion | version after the write |
| occurredAt | UTC ISO-8601 |
| payload | JSON object |

Clients drop an event when `entityVersion` is not strictly newer than the one they hold.
