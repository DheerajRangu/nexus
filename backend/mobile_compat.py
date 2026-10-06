"""Preserved Expo client wire shapes projected from the same emergency authority.

No mobile simulation store. Legacy commands invoke the shared lifecycle functions.
"""

from fastapi import APIRouter, Request, Response, HTTPException
from backend.emergency_api import actor, require, sign_in, IncidentInput, Point
from backend.emergency_store import read_city, mutate, uid, now
from backend import emergency_service as service

router = APIRouter()
ROLES = {
    "Citizen": "CITIZEN",
    "Ambulance Driver": "AMBULANCE_DRIVER",
    "Paramedic": "AMBULANCE_DRIVER",
    "Hospital Staff": "HOSPITAL_OPERATOR",
    "Traffic Officer": "CONTROL_ROOM_OPERATOR",
    "Emergency Operator": "CONTROL_ROOM_OPERATOR",
    "Administrator": "SYSTEM_ADMIN",
}


def projection(city, user):
    from backend.emergency_api import scoped

    city = scoped(city, user)
    xy = lambda point: {
        "x": max(0, min(100, 50 + (point["longitude"] - 77.5946) * 2000)),
        "y": max(0, min(100, 50 - (point["latitude"] - 12.9716) * 2000)),
    }
    emergencies = []
    for incident in city["incidents"]:
        emergencies.append(
            {
                **incident,
                **xy(incident["location"]),
                "owner": "shared",
                "name": incident["patientName"],
                "type": incident["emergencyType"],
                "priority": incident["severity"],
                "created": int(
                    __import__("datetime")
                    .datetime.fromisoformat(incident["createdAt"])
                    .timestamp()
                    * 1000
                ),
                "ambulance": incident["ambulanceId"] or "",
                "hospital": incident["hospitalId"] or "",
                "route": incident["routeId"] or "",
                "eta": incident["etaSeconds"] or 0,
                "normalEta": incident["etaSeconds"] or 0,
                "optimizedEta": incident["etaSeconds"] or 0,
                "progress": 100 if incident["status"] == "COMPLETED" else 0,
                "reroutes": sum(
                    e["type"] == "route.rerouted" for e in incident["timeline"]
                ),
                "readiness": 100
                if incident["status"] in {"EN_ROUTE_TO_HOSPITAL", "COMPLETED"}
                else 0,
                "vitals": {
                    "hr": incident["vitals"].get("heartRate", 0),
                    "spo2": incident["vitals"].get("spo2", 0),
                    "bp": incident["vitals"].get("bp", "—"),
                    "consciousness": incident["vitals"].get(
                        "consciousness", "Not recorded"
                    ),
                    "bleeding": incident["vitals"].get("bleeding", "Not recorded"),
                },
                "timeline": [
                    {
                        "time": int(
                            __import__("datetime")
                            .datetime.fromisoformat(e["occurredAt"])
                            .timestamp()
                            * 1000
                        ),
                        "text": e["type"],
                        "kind": "warning" if "rejected" in e["type"] else "success",
                    }
                    for e in incident["timeline"]
                ],
                "observations": [str(incident["vitals"].get("notes", ""))],
            }
        )
    hospitals = [
        {
            **h,
            **xy(h["location"]),
            "district": "Registered emergency network",
            "icu": max(0, h["icuBeds"] - len(h["reservations"])),
            "load": h["workload"],
            "specialist": bool(h["specialists"]),
            "trauma": "TRAUMA" in h["specialists"],
            "distance": 0,
            "eta": 0,
            "resources": [
                {
                    "id": h["id"] + "-ICU-" + str(i),
                    "type": "ICU bed",
                    "status": "RESERVED" if i < len(h["reservations"]) else "AVAILABLE",
                }
                for i in range(h["icuBeds"])
            ],
        }
        for h in city["hospitals"]
    ]
    signals = [
        {
            **s,
            **xy(s["location"]),
            "mode": "CORRIDOR" if c["status"] == "ACTIVE" else "NORMAL",
            "density": 0,
            "blocked": False,
        }
        for c in city["corridors"]
        for s in c["signals"]
    ]
    return {
        "emergencies": emergencies,
        "hospitals": hospitals,
        "ambulances": [
            {
                **a,
                **xy(a["location"]),
                "equipment": " · ".join(a["equipment"]),
                "eta": 0,
            }
            for a in city["ambulances"]
        ],
        "signals": signals,
        "roads": [],
        "incidents": [{**e, **xy(e)} for e in city["roadEvents"]],
        "weights": [25, 25, 15, 15, 10, 10],
        "disaster": False,
        "network": True,
        "demoStart": None,
        "demoStep": 0,
        "notifications": [
            {
                "id": e["eventId"],
                "message": e["type"],
                "time": int(
                    __import__("datetime")
                    .datetime.fromisoformat(e["occurredAt"])
                    .timestamp()
                    * 1000
                ),
            }
            for e in city["events"][-20:]
        ],
        "history": [],
        "mass": [],
        "revision": city["revision"],
    }


def user_shape(user):
    return {
        "id": user.get("resourceId") or user["role"],
        "name": user.get("resourceId") or user["role"].replace("_", " ").title(),
        "email": "",
        "role": next(
            (k for k, v in ROLES.items() if v == user["role"]), "Emergency Operator"
        ),
    }


@router.get("/api/state")
def mobile_state(request: Request):
    user = actor(request)
    return {"state": projection(read_city(), user), "user": user_shape(user)}


@router.post("/api/auth")
def mobile_auth(body: dict, response: Response, request: Request):
    if body.get("action") == "logout":
        from backend.emergency_api import sign_out

        return sign_out(request, response)
    if body.get("action") != "demo":
        raise HTTPException(
            422,
            "Account registration provider is not configured; use the explicit demo workspace",
        )
    role = ROLES.get(body.get("role", "Citizen"))
    resource = body.get("resourceId") or (
        "AMB-07"
        if role == "AMBULANCE_DRIVER"
        else "HOSP-B"
        if role == "HOSPITAL_OPERATOR"
        else None
    )
    result = sign_in(
        {"role": role, "resourceId": resource, "key": body.get("key")}, response
    )
    return {
        "user": user_shape({"role": role, "resourceId": resource}),
        "token": result["token"],
    }


@router.post("/api/action")
def mobile_action(body: dict, request: Request):
    user = actor(request)
    action = body.get("action")
    if action == "create":
        from backend.emergency_api import demo_enabled

        require(request, {"CITIZEN", "CONTROL_ROOM_OPERATOR"})
        if not demo_enabled():
            raise HTTPException(
                403, "Citizen admission provider required outside demo mode"
            )
        if not body.get("location"):
            raise HTTPException(
                422, "A confirmed device or map pickup location is required"
            )
        model = IncidentInput(
            submissionId=body.get("submissionId", uid("REQ")),
            patientName=body.get("name", "Emergency patient"),
            age=body.get("age", 0),
            location=body["location"],
            emergencyType={
                "Road accident": "ROAD_ACCIDENT",
                "Cardiac": "CARDIAC",
                "Stroke": "STROKE",
                "Breathing Emergency": "BREATHING",
            }.get(body.get("type"), "OTHER"),
            severity=body.get("severity", "HIGH"),
        )
        incident = mutate(
            lambda city: service.create_incident(city, model.model_dump())
        )
        if user["role"] == "CITIZEN":
            from backend.emergency_store import EmergencyAccess, hashed
            from backend.database import Session

            value = request.headers.get("authorization", "").removeprefix(
                "Bearer "
            ) or request.cookies.get("aegis_ops")
            with Session.begin() as db:
                db.get(EmergencyAccess, hashed(value)).incident_id = incident["id"]
        user = actor(request)
    elif action in {"demo", "reset"}:
        from backend.emergency_api import seed

        seed(request)
    else:
        from backend.emergency_api import incident_action

        translated = {
            "accept": "accept",
            "arrived": "arrived-patient",
            "pickup": "pickup",
            "complete": "arrived-hospital",
            "reroute": "reroute",
            "vitals": "assessment",
            "prepare": "hospital-accept",
        }.get(action)
        if action == "accept":
            from backend.emergency_api import assignment_action

            assignment_action(body["assignmentId"], "accept", request, body)
        elif translated:
            incident_action(body["id"], translated, request, body)
        else:
            raise HTTPException(
                422, "This command requires the connected operational interface"
            )
    return {"state": projection(read_city(), user)}


@router.get("/api/v1/driver/me/snapshot")
def flutter_snapshot(request: Request):
    user = require(request, {"AMBULANCE_DRIVER"})
    city = read_city()
    ambulance = service.find(city, "ambulances", user["resourceId"])
    incident = next(
        (
            i
            for i in city["incidents"]
            if i["ambulanceId"] == ambulance["id"]
            and i["status"] not in {"COMPLETED", "CANCELLED"}
        ),
        None,
    )
    value = None
    if incident:
        a = service.find(city, "assignments", incident["assignmentId"])
        r = (
            service.find(city, "routes", incident["routeId"])
            if incident["routeId"]
            else None
        )
        value = {
            "assignmentId": a["id"],
            "missionId": incident["id"],
            "emergencyId": incident["id"],
            "ambulanceId": ambulance["id"],
            "state": incident["status"],
            "receivedAt": a["receivedAt"],
            "acknowledgedAt": a["acceptedAt"],
            "pickup": {"coordinates": incident["location"]},
            "requiredEquipment": service.requirements(incident)["equipment"],
            "operationalNotes": incident["description"],
            "route": {
                "id": r["id"],
                "geometry": r["geometry"],
                "distanceMeters": r["distanceMeters"],
                "durationSeconds": incident["etaSeconds"],
                "provider": r["provider"],
            }
            if r
            else None,
        }
    return {
        "ambulance": {
            "ambulanceId": ambulance["id"],
            "status": ambulance["status"],
            "location": ambulance["location"],
            "telemetry": {
                "sequenceNumber": ambulance["sequence"],
                "lastLocationAt": ambulance["lastLocationAt"],
            },
        },
        "assignment": value,
        "serverTime": now(),
    }


@router.post("/api/v1/driver/assignments/{assignment_id}/{action}")
def flutter_assignment(
    assignment_id: str, action: str, request: Request, body: dict = {}
):
    from backend.emergency_api import assignment_action, incident_action

    a = service.find(read_city(), "assignments", assignment_id)
    if action in {"receipt", "acknowledgement", "reject"}:
        return assignment_action(
            assignment_id,
            "accept" if action == "acknowledgement" else action,
            request,
            body,
        )
    if action in {"arrival", "pickup", "arrived-hospital"}:
        return incident_action(
            a["incidentId"],
            "arrived-patient" if action == "arrival" else action,
            request,
            body,
        )
    if action == "operational-problems":
        require(request, {"AMBULANCE_DRIVER"}, a["ambulanceId"])

        def run(city):
            assignment, incident = service.current_assignment(city, assignment_id)
            service.emit(
                city,
                "ambulance.operational.problem",
                incident,
                detail=str(body.get("detail", ""))[:1000],
            )
            return incident

        return mutate(run)
    raise HTTPException(404, "Unknown driver action")


@router.post("/api/v1/driver/telemetry")
def flutter_telemetry(body: dict, request: Request):
    from backend.emergency_api import gps, LocationInput

    payload = LocationInput(
        location={"latitude": body["latitude"], "longitude": body["longitude"]},
        sequence=body["sequenceNumber"],
        timestamp=body["capturedAt"],
        heading=body.get("bearingDegrees") or 0,
        speed=(body.get("speedMps") or 0) * 3.6,
    )
    return gps(body["ambulanceId"], payload, request)
