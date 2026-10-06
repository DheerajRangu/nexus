"""Existing citizen contract backed by the shared emergency database."""

import asyncio, json, time
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import StreamingResponse
from backend.emergency_store import read_city, mutate, access, resolve, now
from backend.emergency_api import cookie, Point, fail
from backend import emergency_service as service

router = APIRouter(prefix="/api/v1/citizen")


def citizen(request):
    user = resolve(request.cookies.get("aegis_cts"), "citizen")
    if not user:
        fail("SESSION_REQUIRED", "Tracking session required", 401)
    requested = request.query_params.get("emergencyId")
    if requested and requested != user["incidentId"]:
        fail("CROSS_MISSION_DENIED", "Other emergencies are not accessible", 403)
    return user


def snapshot(city, user):
    incident = service.find(city, "incidents", user["incidentId"])
    status = incident["status"]
    phase = (
        "COMPLETED"
        if status == "COMPLETED"
        else "CANCELLED"
        if status == "CANCELLED"
        else "ARRIVED_AT_HOSPITAL"
        if status in {"ARRIVED_AT_HOSPITAL", "PATIENT_HANDOVER"}
        else "TRAVELLING_TO_HOSPITAL"
        if status
        in {"HOSPITAL_ACCEPTED", "GREEN_CORRIDOR_ACTIVE", "EN_ROUTE_TO_HOSPITAL"}
        else "AMBULANCE_AT_PICKUP"
        if status
        in {
            "ARRIVED_AT_PATIENT",
            "PATIENT_ONBOARD",
            "HOSPITAL_SELECTION",
            "HOSPITAL_ASSIGNED",
            "HOSPITAL_REJECTED",
        }
        else "AMBULANCE_APPROACHING"
        if status in {"EN_ROUTE_TO_PATIENT", "REROUTING", "ROAD_BLOCKED"}
        else "AMBULANCE_ASSIGNED"
        if status == "DRIVER_ACCEPTED"
        else "COORDINATING"
    )
    if status in {"REROUTING", "ROAD_BLOCKED"} and incident["hospitalId"]:
        phase = "TRAVELLING_TO_HOSPITAL"
    if status in {"HOSPITAL_ASSIGNED", "HOSPITAL_REJECTED"} and incident.get(
        "resumeHospitalTravel"
    ):
        phase = "COORDINATING"
    suffix = {
        "COORDINATING": "coordinating",
        "AMBULANCE_ASSIGNED": "assigned",
        "AMBULANCE_APPROACHING": "approaching",
        "AMBULANCE_AT_PICKUP": "atPickup",
        "TRAVELLING_TO_HOSPITAL": "travelling",
        "ARRIVED_AT_HOSPITAL": "arrived",
        "COMPLETED": "completed",
        "CANCELLED": "cancelled",
    }[phase]
    ambulance = (
        service.find(city, "ambulances", incident["ambulanceId"])
        if incident["ambulanceId"]
        else None
    )
    accepted = bool(
        incident["assignmentId"]
        and service.find(city, "assignments", incident["assignmentId"])["status"]
        == "ACCEPTED"
    )
    route = (
        service.find(city, "routes", incident["routeId"])
        if incident["routeId"]
        else None
    )
    terminal = status in {"COMPLETED", "CANCELLED"}
    stamp = (
        datetime.fromisoformat(ambulance["lastLocationAt"].replace("Z", "+00:00"))
        if ambulance
        else None
    )
    stale = bool(stamp and (datetime.now(timezone.utc) - stamp).total_seconds() > 30)
    confirmed_hospital = (
        phase in {"TRAVELLING_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL", "COMPLETED"}
        and incident["hospitalId"]
    )
    hospital = (
        service.find(city, "hospitals", incident["hospitalId"])
        if confirmed_hospital
        else None
    )
    return {
        "contractVersion": "1.0.0",
        "synthetic": city["simulation"],
        "emergencyId": incident["id"],
        "missionId": incident["id"],
        "missionReference": incident["id"],
        "phase": phase,
        "statusKey": "status." + suffix,
        "explanationKey": suffix,
        "statusExplanation": status.replace("_", " ").capitalize(),
        "dispatchDelayed": status == "CRITICAL_ESCALATION",
        "serverTime": now(),
        "updatedAt": incident["updatedAt"],
        "accessExpiresAt": datetime.fromtimestamp(
            user["expires"], timezone.utc
        ).isoformat(),
        "lastEventId": str(incident["version"]),
        "stateVersion": incident["version"],
        "versions": {
            k: incident["version"]
            for k in ["mission", "assignment", "telemetry", "route", "hospital"]
        }
        | {"location": incident["locationVersion"]},
        "location": {
            "confirmationRequired": False,
            "confirmedPickup": {
                **incident["location"],
                "accuracyMeters": None,
                "observedAt": incident["createdAt"],
                "source": "BROWSER_GPS" if not city["simulation"] else "MANUAL_PIN",
                "addressFormatted": incident.get("address", "Confirmed patient pickup"),
                "notes": incident.get(
                    "locationNotes",
                    {
                        "landmark": None,
                        "floor": None,
                        "building": None,
                        "gate": None,
                        "access": None,
                    },
                ),
                "role": "WITH_PATIENT",
                "confirmedAt": incident["createdAt"],
            },
            "correction": incident.get("locationCorrection"),
        },
        "assignment": {
            "ambulanceId": ambulance["id"],
            "unitLabel": ambulance["id"],
            "vehicleType": "ALS" if "ALS" in ambulance["crew"] else "BLS",
            "registrationLabel": ambulance["id"],
        }
        if ambulance and accepted
        else None,
        "telemetry": {
            "ambulanceId": ambulance["id"],
            **ambulance["location"],
            "accuracyMeters": 10,
            "observedAt": ambulance["lastLocationAt"],
            "stale": stale,
            "staleAfterSeconds": 30,
        }
        if ambulance and accepted
        else None,
        "eta": {
            "estimatedArrivalAt": (
                datetime.now(timezone.utc)
                + timedelta(seconds=incident["etaSeconds"] or 0)
            ).isoformat(),
            "destination": "HOSPITAL" if hospital else "PICKUP",
            "source": "ROUTING",
            "demonstration": city["simulation"],
        }
        if accepted and route and not route["blocked"] and not stale and not terminal
        else None,
        "route": {"points": route["geometry"], "updatedAt": route["createdAt"]}
        if route and accepted and not terminal
        else None,
        "hospital": {
            "hospitalId": hospital["id"],
            "name": hospital["name"],
            **hospital["location"],
            "confirmed": True,
        }
        if hospital
        else None,
        "permissions": {
            "canConfirmLocation": False,
            "canCorrectLocation": status
            in {"CREATED", "DISPATCHING", "DRIVER_NOTIFIED", "EN_ROUTE_TO_PATIENT"},
            "canContactControlRoom": False,
            "canContactDriver": False,
        },
    }


@router.post("/sessions")
def exchange(body: dict, response: Response):
    owner = resolve(body.get("linkToken"), "tracking")
    if not owner:
        fail("TOKEN_INVALID", "Invalid or expired tracking link", 401)
    session = access(
        "citizen",
        incident_id=owner["incidentId"],
        seconds=max(1, int(owner["expires"] - time.time())),
    )
    cookie(response, "aegis_cts", session)
    user = resolve(session, "citizen")
    return {
        "contractVersion": "1.0.0",
        "sessionExpiresAt": datetime.fromtimestamp(
            user["expires"], timezone.utc
        ).isoformat(),
        "tracking": snapshot(read_city(), user),
    }


@router.get("/tracking")
def tracking(request: Request):
    return snapshot(read_city(), citizen(request))


@router.post("/location")
def correct_location(body: dict, request: Request):
    user = citizen(request)
    if not body.get("confirmed"):
        fail("VALIDATION", "Confirm the selected pickup point", 422)
    point = Point(**body["pickup"]).model_dump()

    def run(city):
        incident = service.find(city, "incidents", user["incidentId"])
        if incident["status"] not in {
            "CREATED",
            "DISPATCHING",
            "DRIVER_NOTIFIED",
            "EN_ROUTE_TO_PATIENT",
        }:
            fail("LOCATION_CLOSED", "Pickup can no longer be corrected", 409)
        if body.get("expectedLocationVersion") != incident["locationVersion"]:
            fail("VERSION_CONFLICT", "Pickup changed; refresh", 409)
        incident["location"] = point
        incident["locationVersion"] += 1
        incident["address"] = str(body.get("addressFormatted", ""))[:300]
        incident["locationNotes"] = body.get("notes", {})
        incident["locationCorrection"] = {
            "alertedControlRoom": True,
            "alertedDriver": bool(incident["ambulanceId"]),
            "hospitalChanged": False,
            "at": now(),
        }
        service.emit(city, "patient.location.corrected", incident, location=point)
        if incident["status"] == "EN_ROUTE_TO_PATIENT":
            service.update_route(city, incident, "Caller corrected pickup")

    mutate(run)
    return {
        "contractVersion": "1.0.0",
        "tracking": snapshot(read_city(), user),
        "alerts": {"controlRoom": True, "driver": True, "hospitalChanged": False},
    }


@router.get("/events")
async def events(request: Request):
    user = citizen(request)

    async def stream():
        version = -1
        while not await request.is_disconnected():
            if not resolve(request.cookies.get("aegis_cts"), "citizen"):
                break
            current = snapshot(read_city(), user)
            if current["stateVersion"] != version:
                version = current["stateVersion"]
                event = {
                    "eventId": str(version),
                    "sequence": version,
                    "contractVersion": "1.0.0",
                    "type": "mission.updated",
                    "emergencyId": user["incidentId"],
                    "missionId": user["incidentId"],
                    "entity": "mission",
                    "version": version,
                    "occurredAt": now(),
                    "snapshot": current,
                }
                yield (
                    f"id: {version}\nevent: message\ndata: "
                    + json.dumps(event)
                    + "\n\n"
                )
            else:
                yield ": heartbeat\n\n"
            await asyncio.sleep(0.35)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/places/reverse")
def reverse(latitude: float, longitude: float, request: Request):
    citizen(request)
    point = Point(latitude=latitude, longitude=longitude)
    return {
        "contractVersion": "1.0.0",
        "syntheticAddress": True,
        "results": [{"label": "Selected pickup point", **point.model_dump()}],
    }


@router.get("/places/search")
def places(q: str, request: Request):
    citizen(request)
    return {"contractVersion": "1.0.0", "syntheticAddress": True, "results": []}
