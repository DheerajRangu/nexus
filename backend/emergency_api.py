"""One authenticated API and durable real-time stream for all four interfaces."""

import asyncio, copy, json, os, time
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from backend.emergency_store import (
    read_city,
    mutate,
    demo_seed,
    access,
    resolve,
    now,
    uid,
)
from backend import emergency_service as service

router = APIRouter()
ROLES = {
    "CONTROL_ROOM_OPERATOR",
    "AMBULANCE_DRIVER",
    "HOSPITAL_OPERATOR",
    "SYSTEM_ADMIN",
    "CITIZEN",
}


def demo_enabled():
    return os.getenv("AEGIS_DEMO_MODE", "true").lower() == "true"


def fail(code, message, status=400):
    raise HTTPException(status, {"code": code, "message": message})


def actor(request):
    user = resolve(
        request.cookies.get("aegis_ops")
        or request.headers.get("authorization", "").removeprefix("Bearer "),
        "operator",
    )
    if not user:
        raise HTTPException(401, "Sign in to an operational role")
    return user


def require(request, roles, resource=None):
    user = actor(request)
    if user["role"] not in set(roles) | {"SYSTEM_ADMIN"}:
        raise HTTPException(403, "Role cannot perform this action")
    if resource and user["role"] != "SYSTEM_ADMIN" and user["resourceId"] != resource:
        raise HTTPException(403, "Resource belongs to another operator")
    origin = request.headers.get("origin")
    if (
        request.method not in {"GET", "HEAD"}
        and origin
        and origin.rstrip("/")
        not in {
            str(request.base_url).rstrip("/"),
            *os.getenv(
                "CORS_ORIGINS", "http://localhost:5173,http://localhost:8080"
            ).split(","),
        }
    ):
        raise HTTPException(403, "Request origin is not permitted")
    return user


def cookie(response, name, value):
    response.set_cookie(
        name,
        value,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "false") == "true",
        max_age=3600,
        path="/",
    )


class Point(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class IncidentInput(BaseModel):
    submissionId: str = Field(min_length=8, max_length=100)
    patientName: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=30)
    age: int = Field(default=0, ge=0, le=120)
    location: Point
    emergencyType: Literal[
        "ROAD_ACCIDENT", "CARDIAC", "STROKE", "BREATHING", "INJURY", "OTHER"
    ] = "ROAD_ACCIDENT"
    description: str = Field(default="", max_length=2000)
    severity: Literal["LOW", "MODERATE", "HIGH", "CRITICAL"] = "HIGH"


class LocationInput(BaseModel):
    location: Point
    sequence: int = Field(gt=0)
    timestamp: str
    heading: float = Field(default=0, ge=0, le=360)
    speed: float = Field(default=0, ge=0, le=200)

    @model_validator(mode="after")
    def valid_time(self):
        try:
            stamp = datetime.fromisoformat(self.timestamp.replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError("Timestamp requires timezone")
        except ValueError:
            raise ValueError("Invalid timestamp")
        return self


class CapacityInput(BaseModel):
    icuBeds: int | None = Field(default=None, ge=0, le=1000)
    generalBeds: int | None = Field(default=None, ge=0, le=10000)
    traumaBeds: int | None = Field(default=None, ge=0, le=1000)
    doctors: int | None = Field(default=None, ge=0, le=1000)
    erAvailable: bool | None = None
    diversion: bool | None = None
    workload: int | None = Field(default=None, ge=0, le=100)
    specialists: list[str] | None = Field(default=None, max_length=40)
    equipment: list[str] | None = Field(default=None, max_length=40)


class RoadInput(Point):
    type: Literal[
        "ACCIDENT",
        "ACCIDENT_AFTERMATH",
        "ROAD_BLOCKAGE",
        "ROAD_CLOSURE",
        "CONSTRUCTION",
        "CONGESTION",
        "DEBRIS",
        "FLOODING",
    ]
    severity: Literal["NOTICE", "HIGH", "CRITICAL"] = "HIGH"
    description: str = Field(min_length=1, max_length=2000)
    radiusMeters: int = Field(default=150, ge=10, le=1500)
    estimatedDelaySeconds: int = Field(default=120, ge=0, le=7200)
    confidence: float | None = Field(default=None, ge=0, le=1)
    confidenceType: str = "operator observation"
    roadName: str = Field(default="", max_length=150)
    source: str = "OPERATOR"
    cameraId: str | None = None
    evidenceImage: str | None = None
    sourceEventId: str | None = None


@router.post("/api/auth/session")
def sign_in(body: dict, response: Response):
    role = body.get("role", "CONTROL_ROOM_OPERATOR")
    resource = body.get("resourceId")
    if role not in ROLES:
        raise HTTPException(422, "Unknown role")
    if not demo_enabled():
        key = os.getenv("AEGIS_OPERATOR_KEY")
        if not key or body.get("key") != key:
            raise HTTPException(401, "Operational credentials required")
        # Operator bootstrap secret cannot impersonate a citizen token.
    city = read_city()
    if role == "AMBULANCE_DRIVER":
        service.find(city, "ambulances", resource)
    if role == "HOSPITAL_OPERATOR":
        service.find(city, "hospitals", resource)
    token = access("operator", role=role, resource_id=resource)
    cookie(response, "aegis_ops", token)
    return {
        "role": role,
        "resourceId": resource,
        "demo": demo_enabled(),
        "token": token,
    }


@router.delete("/api/auth/session")
def sign_out(request: Request, response: Response):
    from backend.emergency_store import EmergencyAccess, hashed
    from backend.database import Session

    value = request.cookies.get("aegis_ops")
    if value:
        with Session.begin() as db:
            row = db.get(EmergencyAccess, hashed(value))
            if row:
                db.delete(row)
    response.delete_cookie("aegis_ops")
    return {"signedOut": True}


@router.post("/api/demo/seed")
def seed(request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    if not demo_enabled():
        raise HTTPException(403, "Demo disabled")

    def run(city):
        if any(
            e["status"] not in {"COMPLETED", "CANCELLED"} for e in city["incidents"]
        ):
            raise HTTPException(
                409, "Complete or cancel active emergencies before reseeding"
            )
        old_events = city["events"]
        city.update(demo_seed())
        city["events"] = old_events
        service.emit(city, "demo.seeded")
        return city

    return mutate(run)


def scoped(city, user):
    if user["role"] in {"CONTROL_ROOM_OPERATOR", "SYSTEM_ADMIN"}:
        return city
    result = copy.deepcopy(city)
    if user["role"] == "AMBULANCE_DRIVER":
        result["incidents"] = [
            e for e in city["incidents"] if e["ambulanceId"] == user["resourceId"]
        ]
        result["ambulances"] = [
            a for a in city["ambulances"] if a["id"] == user["resourceId"]
        ]
    elif user["role"] == "HOSPITAL_OPERATOR":
        result["incidents"] = [
            e for e in city["incidents"] if e["hospitalId"] == user["resourceId"]
        ]
    else:
        result["incidents"] = [
            e for e in city["incidents"] if e["id"] == user.get("incidentId")
        ]
        result["ambulances"] = [
            a
            for a in city["ambulances"]
            if any(e["ambulanceId"] == a["id"] for e in result["incidents"])
        ]
        result["hospitals"] = []
    ids = {e["id"] for e in result["incidents"]}
    for key in ["assignments", "routes", "corridors"]:
        result[key] = [x for x in city[key] if x["incidentId"] in ids]
    result["events"] = [
        e
        for e in city["events"]
        if e.get("incidentId") in ids
        or (
            e["type"] == "hospital.capacity.updated"
            and user["role"] == "HOSPITAL_OPERATOR"
            and e["details"]["hospitalId"] == user["resourceId"]
        )
    ]
    return result


@router.get("/api/ecosystem/state")
def state(request: Request):
    return {"state": scoped(read_city(), actor(request)), "user": actor(request)}


@router.get("/api/ecosystem/events")
async def event_stream(request: Request):
    user = actor(request)

    async def stream():
        revision = -1
        while not await request.is_disconnected():
            current_user = resolve(
                request.cookies.get("aegis_ops")
                or request.headers.get("authorization", "").removeprefix("Bearer "),
                "operator",
            )
            if not current_user:
                break
            city = read_city()
            if city["revision"] != revision:
                revision = city["revision"]
                yield (
                    f"id: {revision}\nevent: state\ndata: "
                    + json.dumps({"state": scoped(city, current_user)})
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


@router.post("/api/incidents")
def create(body: IncidentInput, response: Response):
    if not demo_enabled():
        raise HTTPException(
            403, "Citizen admission provider required outside demo mode"
        )
    incident = mutate(lambda city: service.create_incident(city, body.model_dump()))
    token = access("tracking", incident_id=incident["id"])
    session = access("citizen", incident_id=incident["id"])
    cookie(response, "aegis_cts", session)
    return {
        "incidentId": incident["id"],
        "status": incident["status"],
        "trackingLink": "/emergency-track/" + token,
    }


@router.get("/api/incidents")
def incidents(request: Request):
    return scoped(read_city(), actor(request))["incidents"]


@router.get("/api/incidents/{incident_id}")
def incident_detail(incident_id: str, request: Request):
    return service.find(scoped(read_city(), actor(request)), "incidents", incident_id)


@router.get("/api/incidents/{incident_id}/timeline")
def timeline(incident_id: str, request: Request):
    return incident_detail(incident_id, request)["timeline"]


@router.get("/api/ambulances")
def ambulances(request: Request):
    return scoped(read_city(), actor(request))["ambulances"]


@router.get("/api/hospitals")
def hospitals(request: Request):
    actor(request)
    return read_city()["hospitals"]


@router.get("/api/road-events")
def roads(request: Request):
    actor(request)
    return read_city()["roadEvents"]


@router.post("/api/incidents/{incident_id}/dispatch")
def dispatch(incident_id: str, request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    return mutate(
        lambda city: service.dispatch(
            city, service.find(city, "incidents", incident_id)
        )
    )


@router.post("/api/assignments/{assignment_id}/{action}")
def assignment_action(
    assignment_id: str, action: str, request: Request, body: dict = {}
):
    city = read_city()
    assignment = service.find(city, "assignments", assignment_id)
    require(request, {"AMBULANCE_DRIVER"}, assignment["ambulanceId"])

    def run(city):
        if action == "receipt":
            assignment, incident = service.current_assignment(city, assignment_id)
            if assignment["status"] != "CONFIRMED":
                raise HTTPException(409, "Assignment is no longer active")
            if assignment["receivedAt"] is None:
                assignment["receivedAt"] = now()
                service.emit(city, "ambulance.assignment.received", incident)
            return incident
        if action == "acknowledgement":
            return service.acknowledge(city, assignment_id)
        raise HTTPException(404, "Unknown assignment action")

    return mutate(run)


@router.post("/api/ambulances/{ambulance_id}/location")
def gps(ambulance_id: str, body: LocationInput, request: Request):
    require(request, {"AMBULANCE_DRIVER"}, ambulance_id)
    return mutate(
        lambda city: service.location_update(city, ambulance_id, body.model_dump())
    )


@router.post("/api/incidents/{incident_id}/{action}")
def incident_action(incident_id: str, action: str, request: Request, body: dict = {}):
    current = service.find(read_city(), "incidents", incident_id)
    if action in {"arrived-patient", "pickup", "assessment", "arrived-hospital"}:
        require(request, {"AMBULANCE_DRIVER"}, current["ambulanceId"])
    elif action in {"hospital-accept", "hospital-reject", "handover"}:
        require(request, {"HOSPITAL_OPERATOR"}, current["hospitalId"])
    else:
        require(request, {"CONTROL_ROOM_OPERATOR"})

    def run(city):
        incident = service.find(city, "incidents", incident_id)
        if action in {"arrived-patient", "pickup", "assessment", "arrived-hospital"}:
            require(request, {"AMBULANCE_DRIVER"}, incident["ambulanceId"])
        elif action in {"hospital-accept", "hospital-reject", "handover"}:
            require(request, {"HOSPITAL_OPERATOR"}, incident["hospitalId"])
        if (
            body.get("expectedVersion") is not None
            and body["expectedVersion"] != incident["version"]
        ):
            raise HTTPException(409, "Incident version changed; refresh")
        if action == "arrived-patient":
            service.transition(city, incident, "ARRIVED_AT_PATIENT", "patient.arrived")
        elif action == "pickup":
            return service.pickup(city, incident)
        elif action == "assessment":
            if incident["status"] in {"COMPLETED", "CANCELLED"}:
                raise HTTPException(409, "Emergency ended")
            severity = body.get("severity")
            if severity not in {"LOW", "MODERATE", "HIGH", "CRITICAL"}:
                raise HTTPException(422, "Clinician-confirmed severity required")
            incident["severity"] = severity
            incident["vitals"] = body.get("vitals", {})
            service.emit(
                city,
                "patient.severity.updated",
                incident,
                severity=severity,
                authority="EMT confirmed decision support",
            )
            if incident["hospitalId"]:
                rankings = service.hospital_rankings(city, incident)
                incident["hospitalRankings"] = rankings
                service.emit(
                    city, "hospital.rankings.updated", incident, rankings=rankings
                )
                selected = next(
                    h for h in rankings if h["hospitalId"] == incident["hospitalId"]
                )
                if not selected["eligible"]:
                    service.select_hospital(city, incident)
        elif action == "select-hospital":
            return service.select_hospital(city, incident, body.get("hospitalId"))
        elif action == "hospital-accept":
            return service.hospital_accept(city, incident)
        elif action == "hospital-reject":
            return service.hospital_reject(
                city, incident, str(body.get("reason", "Capacity issue"))[:500]
            )
        elif action == "arrived-hospital":
            service.transition(
                city, incident, "ARRIVED_AT_HOSPITAL", "ambulance.arrived.at.hospital"
            )
        elif action == "handover":
            return service.handover(city, incident)
        elif action == "reroute":
            service.update_route(city, incident, "Operator requested route review")
        elif action == "cancel":
            service.transition(city, incident, "CANCELLED", "emergency.cancelled")
            service.release_reservation(city, incident)
            if incident["ambulanceId"]:
                ambulance = service.find(city, "ambulances", incident["ambulanceId"])
                ambulance["status"] = "AVAILABLE"
                ambulance["workload"] = max(0, ambulance["workload"] - 1)
            if incident["assignmentId"]:
                service.find(city, "assignments", incident["assignmentId"])[
                    "status"
                ] = "CANCELLED"
            if incident["corridorId"]:
                corridor = service.find(city, "corridors", incident["corridorId"])
                corridor["status"] = "CANCELLED"
                for signal in corridor["signals"]:
                    signal.update(state="RED", priority="RELEASED")
                service.emit(
                    city,
                    "green_corridor.cancelled",
                    incident,
                    corridorId=corridor["id"],
                )
        else:
            raise HTTPException(404, "Unknown incident action")
        return incident

    return mutate(run)


@router.patch("/api/hospitals/{hospital_id}/capacity")
def capacity(hospital_id: str, body: CapacityInput, request: Request):
    require(request, {"HOSPITAL_OPERATOR"}, hospital_id)
    return mutate(
        lambda city: service.capacity_update(
            city, hospital_id, body.model_dump(exclude_none=True)
        )
    )


@router.post("/api/road-events")
def create_road(body: RoadInput, request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    return mutate(lambda city: service.road_event(city, body.model_dump()))


@router.post("/api/cameras")
def register_camera(body: dict, request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    point = Point(**body["location"]).model_dump()

    def run(city):
        camera = {
            "id": uid("CAM"),
            "name": str(body.get("name", "Road camera"))[:100],
            "roadName": str(body.get("roadName", ""))[:150],
            "location": point,
            "lastEventId": None,
        }
        city["cameras"].append(camera)
        service.emit(city, "camera.registered", cameraId=camera["id"])
        return camera

    return mutate(run)


@router.patch("/api/road-events/{road_id}")
def resolve_road(road_id: str, body: dict, request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    if body.get("active") is not False:
        raise HTTPException(422, "Only confirmed event clearance is supported")

    def run(city):
        road = service.find(city, "roadEvents", road_id)
        road["active"] = False
        service.emit(city, "road.event.updated", roadEventId=road_id, active=False)
        for incident in city["incidents"]:
            if incident["status"] not in {
                "ROAD_BLOCKED",
                "EN_ROUTE_TO_PATIENT",
                "EN_ROUTE_TO_HOSPITAL",
            }:
                continue
            service.update_route(city, incident, "Road obstruction cleared")
            if incident["status"] == "ROAD_BLOCKED":
                route = service.find(city, "routes", incident["routeId"])
                if not route["blocked"]:
                    service.transition(city, incident, "REROUTING")
                    service.transition(
                        city,
                        incident,
                        incident.get(
                            "resumeJourney",
                            "EN_ROUTE_TO_HOSPITAL"
                            if incident["hospitalId"]
                            else "EN_ROUTE_TO_PATIENT",
                        ),
                    )
        return road

    return mutate(run)
