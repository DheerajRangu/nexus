"""Command actions and authenticated WebSocket snapshots, same city authority."""

import asyncio
import os
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel, Field
from backend.emergency_api import require, demo_enabled, scoped
from backend.emergency_store import read_city, mutate, resolve, now, uid
from backend import emergency_service as service
from backend import command_simulation as simulation

router = APIRouter()


class DemoControl(BaseModel):
    running: bool | None = None
    speed: int | None = Field(default=None, ge=1, le=5)
    auto: bool | None = None
    chaos: bool | None = None


class DemoEvent(BaseModel):
    type: str
    incidentId: str | None = None


@router.post("/api/demo/start")
@router.post("/api/demo/reset")
def start(request: Request):
    user = require(request, {"CONTROL_ROOM_OPERATOR"})
    if not demo_enabled():
        raise HTTPException(403, "Demo disabled")
    return mutate(simulation.seed_command)


@router.patch("/api/demo/control")
def control(body: DemoControl, request: Request):
    user = require(request, {"CONTROL_ROOM_OPERATOR"})
    if not demo_enabled():
        raise HTTPException(403, "Demo disabled")

    def run(city):
        if not city.get("simulationControl"):
            raise HTTPException(409, "Start city simulation first")
        city["simulationControl"].update(body.model_dump(exclude_none=True))
        service.emit(
            city,
            "simulation.control.updated",
            operator=user["role"],
            control=city["simulationControl"],
        )
        return city["simulationControl"]

    return mutate(run)


@router.post("/api/demo/event")
def event(body: DemoEvent, request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    if not demo_enabled():
        raise HTTPException(403, "Demo disabled")
    if body.type not in {
        "ACCIDENT",
        "CARDIAC",
        "MULTI_INCIDENT",
        "ICU_FULL",
        "GREEN_CORRIDOR",
        "TRAFFIC",
        "ROADBLOCK",
        "CONSTRUCTION",
        "CAMERA_ALERT",
    }:
        raise HTTPException(422, "Unknown demo event")
    return mutate(lambda city: simulation.trigger(city, body.type, body.incidentId))


@router.post("/api/command/incidents/{incident_id}/{action}")
def command(incident_id: str, action: str, body: dict, request: Request):
    user = require(request, {"CONTROL_ROOM_OPERATOR"})

    def run(city):
        i = service.find(city, "incidents", incident_id)
        service.emit(
            city,
            "operator.action",
            i,
            operator=user["role"],
            action=action,
            resourceId=user.get("resourceId"),
        )
        if action == "dispatch":
            return service.dispatch(city, i, body.get("ambulanceId"))
        if action == "hospital":
            return service.select_hospital(city, i, body.get("hospitalId"))
        if action == "corridor":
            if i["status"] != "EN_ROUTE_TO_HOSPITAL":
                raise HTTPException(
                    409, "Hospital acceptance required before corridor activation"
                )
            service.activate_corridor(city, i)
            service.update_route(city, i, "Operator corridor activation")
        elif action == "cancel-corridor":
            c = service.find(city, "corridors", i["corridorId"])
            c["status"] = "CANCELLED"
            for s in c["signals"]:
                s.update(state="RED", priority="RELEASED")
            service.emit(city, "green_corridor.cancelled", i, operator=user["role"])
            service.update_route(city, i, "Operator released corridor")
        elif action == "contact":
            service.emit(
                city,
                "operator.contact.requested",
                i,
                operator=user["role"],
                destination=body.get("destination", "DRIVER"),
                status="OPERATOR_REQUESTED",
                note=str(body.get("note", "Contact requested through command room"))[
                    :1000
                ],
            )
        elif action == "hospital-message":
            if not i["hospitalId"]:
                raise HTTPException(409, "Select hospital first")
            message = str(body.get("text", "")).strip()
            if not message or len(message) > 2000:
                raise HTTPException(422, "Provide a message of 1–2000 characters")
            from backend.hospital_command import ensure, audit

            ops = ensure(city, i["hospitalId"])
            ops["messages"].append(
                {
                    "id": uid("MSG"),
                    "incidentId": i["id"],
                    "sender": "COMMAND_ROOM",
                    "text": message,
                    "channel": "COMMAND",
                    "createdAt": now(),
                }
            )
            ops["messages"] = ops["messages"][-300:]
            audit(
                city,
                ops,
                "message.sent",
                i,
                text=message,
                channel="COMMAND",
                sender="COMMAND_ROOM",
            )
        elif action == "hospital-alert":
            if not i["hospitalId"]:
                raise HTTPException(409, "Select hospital first")
            service.emit(
                city,
                "hospital.prearrival.alert",
                i,
                hospitalId=i["hospitalId"],
                etaSeconds=i["etaSeconds"],
                vitals=i["vitals"],
                operator=user["role"],
            )
        elif action == "reassign":
            if i["status"] != "DRIVER_NOTIFIED":
                raise HTTPException(
                    409,
                    "Reassignment is available before driver acceptance; accepted transport needs coordinated transfer",
                )
            return service.reject(
                city, i["assignmentId"], "Operator requested reassignment"
            )
        else:
            raise HTTPException(404, "Unknown command action")
        return i

    return mutate(run)


@router.post("/api/command/alerts/{event_id}/{action}")
def alert(event_id: str, action: str, request: Request):
    user = require(request, {"CONTROL_ROOM_OPERATOR"})
    if action not in {"acknowledge", "mute", "resolve"}:
        raise HTTPException(422, "Unknown alert action")

    def run(city):
        original = next((e for e in city["events"] if e["eventId"] == event_id), None)
        if not original:
            raise HTTPException(404, "Alert not found")
        city.setdefault("alertStatus", {})[event_id] = action
        service.emit(
            city, "alert." + action, operator=user["role"], sourceEventId=event_id
        )
        return {"eventId": event_id, "status": action}

    return mutate(run)


@router.get("/api/system/health")
def health(request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR", "HOSPITAL_OPERATOR"})
    city = read_city()
    return {
        "timestamp": now(),
        "revision": city["revision"],
        "services": {
            "API Gateway": "ONLINE",
            "Database": "ONLINE",
            "Dispatch Engine": "ONLINE",
            "Routing Engine": "DEMO",
            "Camera AI": "AVAILABLE_ON_PLAY",
            "Signal Network": "DEMO",
            "Notification Service": "IN_APP_ONLY",
            "Simulation Engine": "RUNNING"
            if city.get("simulationControl", {}).get("running")
            else "PAUSED",
        },
        "routeProvider": "DEMO_GRAPH",
    }


@router.websocket("/ws/command")
async def stream(ws: WebSocket):
    token = ws.cookies.get("aegis_ops")
    user = resolve(token, "operator")
    allowed = set(
        os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080").split(
            ","
        )
    )
    if not user or ws.headers.get("origin") not in allowed:
        await ws.close(code=1008)
        return
    await ws.accept()
    revision = -1
    try:
        while True:
            user = resolve(token, "operator")
            if not user:
                await ws.close(code=1008)
                return
            city = await asyncio.to_thread(read_city)
            if city["revision"] != revision:
                revision = city["revision"]
                await ws.send_json(
                    {"type": "state", "revision": revision, "state": scoped(city, user)}
                )
            else:
                await ws.send_json({"type": "heartbeat", "timestamp": now()})
            await asyncio.sleep(0.5)
    except (WebSocketDisconnect, RuntimeError):
        pass


@router.get("/api/demo/resources")
def resources():
    if not demo_enabled():
        raise HTTPException(403, "Demo role discovery disabled")
    city = read_city()
    return {
        "ambulances": [
            {"id": a["id"], "name": a.get("driverName", a["id"])}
            for a in city["ambulances"]
        ],
        "hospitals": [{"id": h["id"], "name": h["name"]} for h in city["hospitals"]],
    }


@router.get("/api/cameras")
def cameras(request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    return read_city()["cameras"]


@router.get("/api/ambulances/{ambulance_id}")
def ambulance(ambulance_id: str, request: Request):
    from backend.emergency_api import actor

    user = actor(request)
    return service.find(scoped(read_city(), user), "ambulances", ambulance_id)


class UnitStatus(BaseModel):
    status: str


@router.post("/api/ambulances/{ambulance_id}/status")
def unit_status(ambulance_id: str, body: UnitStatus, request: Request):
    user = require(request, {"CONTROL_ROOM_OPERATOR"})
    if body.status not in {"AVAILABLE", "OFFLINE"}:
        raise HTTPException(
            422, "Journey states are controlled by the incident lifecycle"
        )

    def run(city):
        a = service.find(city, "ambulances", ambulance_id)
        if any(
            i["ambulanceId"] == ambulance_id and i["status"] not in service.TERMINAL
            for i in city["incidents"]
        ):
            raise HTTPException(
                409, "Resolve active dispatch before changing availability"
            )
        a["status"] = body.status
        if body.status == "OFFLINE":
            a["speed"] = 0
        service.emit(
            city,
            "ambulance.status.updated",
            ambulanceId=ambulance_id,
            status=body.status,
            operator=user["role"],
        )
        return a

    return mutate(run)


class CorridorInput(BaseModel):
    incidentId: str


@router.post("/api/corridors")
def create_corridor(body: CorridorInput, request: Request):
    return command(body.incidentId, "corridor", {}, request)


@router.delete("/api/corridors/{corridor_id}")
def delete_corridor(corridor_id: str, request: Request):
    require(request, {"CONTROL_ROOM_OPERATOR"})
    c = service.find(read_city(), "corridors", corridor_id)
    return command(c["incidentId"], "cancel-corridor", {}, request)
