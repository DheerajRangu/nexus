"""Hospital receiving authority: atomic resource locks, preparation and demo lifecycle."""

import math
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from backend import emergency_service as service
from backend.emergency_store import mutate, read_city, now, uid, hashed
from backend.emergency_api import require, sign_in, demo_enabled

router = APIRouter()
STAFF_ROLES = {
    "COMMANDER",
    "EMERGENCY_PHYSICIAN",
    "TRAUMA_LEAD",
    "NURSE_COORDINATOR",
    "RESOURCE_COORDINATOR",
    "RADIOLOGY",
    "BLOOD_BANK",
    "ADMIN",
    "VIEWER",
}
KINDS = {
    "ER": 18,
    "ICU": 12,
    "TRAUMA": 4,
    "VENTILATOR": 10,
    "OT": 5,
    "CT": 2,
    "MRI": 1,
    "XRAY": 2,
    "ULTRASOUND": 3,
    "DEFIBRILLATOR": 4,
    "ECMO": 1,
    "INFUSION": 8,
    "OXYGEN": 8,
    "AIRWAY": 3,
    "SURGICAL_KIT": 5,
}
MEMBERS = [
    ("Trauma surgeon", "Dr. Arjun Rao"),
    ("Emergency physician", "Dr. Neha"),
    ("Anesthetist", "Dr. Vikram"),
    ("Nurse lead", "Sowmya"),
    ("Respiratory therapist", "Ravi"),
    ("Radiology", "Dr. Meera"),
]


def audit(city, ops, event_name, incident=None, **details):
    event = service.emit(
        city,
        "hospital." + event_name,
        incident,
        hospitalId=ops["hospitalId"],
        **details,
    )
    # emit returns an event in the shared service.
    ops["audit"].append(city["events"][-1])
    ops["audit"] = ops["audit"][-500:]
    return event


def ensure(city, hid):
    hospital = service.find(city, "hospitals", hid)
    all_ops = city.setdefault("hospitalOperations", {})
    if hid not in all_ops:
        demo = demo_enabled() and city.get("simulation", False)
        resources = []
        for kind, count in KINDS.items():
            free = {
                "ER": min(count, hospital.get("generalBeds", 6)),
                "ICU": min(count, hospital["icuBeds"]),
                "TRAUMA": min(count, hospital["traumaBeds"]),
                "VENTILATOR": 8,
                "OT": 2,
            }.get(kind, count)
            for n in range(count):
                resources.append(
                    {
                        "id": f"{kind}-{n + 1:02}",
                        "kind": kind,
                        "status": ("AVAILABLE" if n < free else "IN_USE")
                        if demo
                        else "UNAVAILABLE",
                        "incidentId": None,
                        "patientId": None,
                        "updatedAt": now(),
                    }
                )
        all_ops[hid] = {
            "hospitalId": hid,
            "demo": demo,
            "resources": resources,
            "blood": {
                "O-": {"available": 6 if demo else 0, "reserved": {}},
                "O+": {"available": 12 if demo else 0, "reserved": {}},
                "A+": {"available": 10 if demo else 0, "reserved": {}},
                "B+": {"available": 8 if demo else 0, "reserved": {}},
                "AB+": {"available": 4 if demo else 0, "reserved": {}},
            },
            "teams": [
                {
                    "id": f"TEAM-{n + 1}",
                    "name": ["Trauma Alpha", "Trauma Bravo", "Emergency Delta"][n],
                    "incidentId": None,
                    "members": [
                        {
                            "id": f"STAFF-{n}-{j}",
                            "role": role,
                            "name": name
                            if n == 0
                            else name.replace("Dr.", "Dr. Team " + str(n + 1)),
                            "status": "AVAILABLE" if demo else "UNAVAILABLE",
                            "etaSeconds": 0,
                        }
                        for j, (role, name) in enumerate(MEMBERS)
                    ],
                }
                for n in range(3)
            ],
            "preparations": {},
            "messages": [],
            "alerts": [],
            "audit": [],
            "policy": {
                "ROAD_ACCIDENT": True,
                "CARDIAC": True,
                "STROKE": True,
                "BREATHING": True,
                "PEDIATRIC": False,
                "BURNS": False,
            },
            "massCasualty": False,
            "diversionReason": "",
            "board": [],
            "demoControl": {"running": False, "elapsed": 0, "speed": 1, "applied": []},
            "staffCounts": {
                "doctors": 28 if demo else hospital["doctors"],
                "nurses": 46 if demo else 0,
                "specialists": 18 if demo else len(hospital["specialists"]),
            },
        }
        audit(city, all_ops[hid], "command.initialized")
    return all_ops[hid]


def incoming(city, hid):
    return [
        i
        for i in city["incidents"]
        if i["hospitalId"] == hid and i["status"] not in service.TERMINAL
    ]


def tasks_for(incident):
    trauma = incident["emergencyType"] in {"ROAD_ACCIDENT", "INJURY"}
    critical = incident["severity"] == "CRITICAL"
    kinds = [
        "TRAUMA" if trauma else "ER",
        "CT" if trauma or incident["emergencyType"] == "STROKE" else "DEFIBRILLATOR",
    ]
    if critical:
        kinds += ["ICU"]
    if trauma and critical:
        kinds += ["OT", "SURGICAL_KIT"]
    if incident.get("deteriorating") or incident["emergencyType"] == "BREATHING":
        kinds += ["VENTILATOR", "AIRWAY", "OXYGEN"]
    return (
        [
            {
                "id": kind,
                "label": {
                    "TRAUMA": "Reserve receiving trauma bay",
                    "ER": "Reserve emergency bed",
                    "ICU": "Reserve ICU bed",
                    "CT": "Prepare CT slot",
                    "OT": "Prepare operating theatre standby",
                    "SURGICAL_KIT": "Confirm surgical equipment",
                    "VENTILATOR": "Prepare ventilator",
                    "AIRWAY": "Prepare airway equipment for clinician review",
                    "OXYGEN": "Confirm oxygen equipment",
                    "DEFIBRILLATOR": "Check emergency equipment",
                }[kind],
                "status": "PENDING",
                "resourceId": None,
            }
            for kind in kinds
        ]
        + [
            {
                "id": "TEAM",
                "label": "Assemble emergency receiving team",
                "status": "PENDING",
                "resourceId": None,
            }
        ]
        + (
            [
                {
                    "id": "BLOOD",
                    "label": "Reserve 2 units O− for clinician confirmation",
                    "status": "PENDING",
                    "resourceId": None,
                }
            ]
            if trauma and critical
            else []
        )
    )


def prep_for(ops, incident):
    prep = ops["preparations"].setdefault(
        incident["id"],
        {
            "incidentId": incident["id"],
            "patientId": incident["patientId"],
            "status": "NOT_STARTED",
            "tasks": [],
            "teamId": None,
            "startedAt": None,
            "handoverStartedAt": None,
            "handoverChecklist": {},
            "handover": {},
            "conflicts": [],
            "receivedAt": None,
        },
    )
    existing = {t["id"]: t for t in prep["tasks"]}
    for task in tasks_for(incident):
        if task["id"] not in existing:
            prep["tasks"].append(task)
    return prep


def reserve(city, ops, incident, kind):
    prep = prep_for(ops, incident)
    task = next((t for t in prep["tasks"] if t["id"] == kind), None)
    if not task:
        raise HTTPException(422, "Resource is not in this preparation checklist")
    if task["status"] in {"READY", "ASSEMBLING"}:
        return task
    if kind == "TEAM":
        team = next(
            (t for t in ops["teams"] if t["incidentId"] == incident["id"]), None
        ) or next(
            (
                t
                for t in ops["teams"]
                if not t["incidentId"]
                and all(m["status"] != "UNAVAILABLE" for m in t["members"])
            ),
            None,
        )
        if not team:
            raise HTTPException(409, "No complete receiving team available")
        team["incidentId"] = incident["id"]
        prep["teamId"] = team["id"]
        for member in team["members"]:
            member.update(status="NOTIFIED", etaSeconds=30)
        task.update(status="ASSEMBLING", resourceId=team["id"])
    elif kind == "BLOOD":
        blood = ops["blood"]["O-"]
        count = blood["reserved"].get(incident["id"], 0)
        if not count:
            if blood["available"] < 2:
                raise HTTPException(
                    409, "Insufficient O− stock; request blood bank review"
                )
            blood["available"] -= 2
            blood["reserved"][incident["id"]] = 2
        task.update(status="READY", resourceId="O− · 2 units")
    else:
        resource = next(
            (
                r
                for r in ops["resources"]
                if r["kind"] == kind and r["incidentId"] == incident["id"]
            ),
            None,
        ) or next(
            (
                r
                for r in ops["resources"]
                if r["kind"] == kind and r["status"] == "AVAILABLE"
            ),
            None,
        )
        if not resource:
            raise HTTPException(409, "No available " + kind + " resource")
        resource.update(
            status="RESERVED",
            incidentId=incident["id"],
            patientId=incident["patientId"],
            updatedAt=now(),
        )
        task.update(status="READY", resourceId=resource["id"])
    audit(
        city,
        ops,
        "resource.reserved",
        incident,
        resourceKind=kind,
        resourceId=task["resourceId"],
    )
    return task


def prepare(city, ops, incident):
    if incident["status"] in service.TERMINAL:
        raise HTTPException(409, "Patient is no longer incoming")
    if incident["status"] == "HOSPITAL_ASSIGNED":
        service.hospital_accept(city, incident)
    prep = prep_for(ops, incident)
    prep["startedAt"] = prep["startedAt"] or now()
    prep["conflicts"] = []
    for task in prep["tasks"]:
        try:
            reserve(city, ops, incident, task["id"])
        except HTTPException as exc:
            task["status"] = "CONFLICT"
            prep["conflicts"].append(str(exc.detail))
    prep["status"] = "CONFLICT" if prep["conflicts"] else "PREPARING"
    ops["messages"].append(
        {
            "id": uid("MSG"),
            "incidentId": incident["id"],
            "sender": "HOSPITAL",
            "text": "Pre-arrival preparation activated."
            + (" Resource conflict requires review." if prep["conflicts"] else ""),
            "createdAt": now(),
            "channel": "COMMAND",
        }
    )
    audit(city, ops, "preparation.activated", incident, conflicts=prep["conflicts"])
    return prep


def release(city, ops, iid):
    for resource in ops["resources"]:
        if resource["incidentId"] == iid and resource["status"] == "RESERVED":
            resource.update(status="AVAILABLE", incidentId=None, patientId=None)
    for stock in ops["blood"].values():
        stock["available"] += stock["reserved"].pop(iid, 0)
    for team in ops["teams"]:
        if team["incidentId"] == iid:
            team["incidentId"] = None
            for member in team["members"]:
                member.update(status="AVAILABLE", etaSeconds=0)
    if iid in ops["preparations"]:
        ops["preparations"][iid]["status"] = "RELEASED"
        audit(city, ops, "resources.released", incidentId=iid)


def synchronize(city):
    """Release cancelled/diverted locks and expose shared capacity/policy to rankings."""
    for hid, ops in city.get("hospitalOperations", {}).items():
        for iid, prep in ops["preparations"].items():
            incident = next((i for i in city["incidents"] if i["id"] == iid), None)
            if prep["status"] not in {"RECEIVED", "RELEASED"} and (
                not incident
                or incident["hospitalId"] != hid
                or incident["status"] in {"CANCELLED", "COMPLETED"}
            ):
                release(city, ops, iid)
        hospital = service.find(city, "hospitals", hid)
        # Legacy icuBeds is total unoccupied inventory; legacy reservations are subtracted by ranking.
        free = sum(
            r["kind"] == "ICU" and r["status"] == "AVAILABLE" for r in ops["resources"]
        )
        reserved = sum(
            r["kind"] == "ICU" and r["status"] == "RESERVED" for r in ops["resources"]
        )
        hospital["icuBeds"] = free + reserved
        hospital["traumaBeds"] = sum(
            r["kind"] == "TRAUMA" and r["status"] in {"AVAILABLE", "RESERVED"}
            for r in ops["resources"]
        )
        hospital["acceptancePolicy"] = ops["policy"]


class Login(BaseModel):
    resourceId: str
    staffRole: str = "COMMANDER"
    key: str = ""


@router.post("/api/hospital-command/bootstrap")
def bootstrap():
    if not demo_enabled():
        raise HTTPException(403, "Demo disabled")

    def run(city):
        if not city["hospitals"] and not city["incidents"]:
            from backend.emergency_store import demo_seed

            history = city["events"]
            city.update(demo_seed())
            city["events"] = history
            service.emit(city, "hospital.demo.network_initialized")
        return {"initialized": bool(city["hospitals"])}

    return mutate(run)


@router.post("/api/hospital-command/session")
def login(body: Login, response: Response):
    if body.staffRole not in STAFF_ROLES:
        raise HTTPException(422, "Unknown hospital staff role")
    result = sign_in(
        {"role": "HOSPITAL_OPERATOR", "resourceId": body.resourceId, "key": body.key},
        response,
    )

    def run(city):
        ensure(city, body.resourceId)
        city.setdefault("hospitalStaffGrants", {})[hashed(result["token"])] = (
            body.staffRole
        )

    mutate(run)
    return {**result, "staffRole": body.staffRole}


def authorize(request, hid, write=False, action=""):
    user = require(request, {"HOSPITAL_OPERATOR"}, hid)
    token = request.cookies.get("aegis_ops") or request.headers.get(
        "authorization", ""
    ).removeprefix("Bearer ")
    role = (
        read_city().get("hospitalStaffGrants", {}).get(hashed(token or ""), "COMMANDER")
    )
    if write:
        if role == "BLOOD_BANK" and action not in {"reserve", "message", "alert-ack"}:
            raise HTTPException(403, "Blood bank permission required for this workflow")
        if role == "RADIOLOGY" and action not in {
            "reserve",
            "resource-status",
            "message",
            "alert-ack",
        }:
            raise HTTPException(403, "Radiology access is limited to imaging workflows")
        if role == "VIEWER":
            raise HTTPException(403, "Viewer access is read-only")
        if action in {
            "policy",
            "diversion",
            "mass-casualty",
            "demo-start",
            "demo-control",
        } and role not in {"COMMANDER", "ADMIN"}:
            raise HTTPException(403, "Hospital commander permission required")
        if action in {
            "handover-start",
            "handover-save",
            "receive",
            "acknowledge",
            "divert",
        } and role not in {
            "COMMANDER",
            "ADMIN",
            "EMERGENCY_PHYSICIAN",
            "TRAUMA_LEAD",
            "NURSE_COORDINATOR",
        }:
            raise HTTPException(403, "Clinical receiving permission required")
    return user, role


@router.get("/api/hospital-command/{hid}")
def get_state(hid: str, request: Request):
    _, role = authorize(request, hid)
    city = read_city()
    if hid not in city.get("hospitalOperations", {}):
        mutate(lambda c: ensure(c, hid))
        city = read_city()
    return {"operations": city["hospitalOperations"][hid], "staffRole": role}


class Action(BaseModel):
    incidentId: str | None = None
    resourceId: str | None = None
    kind: str | None = None
    text: str = Field(default="", max_length=2000)
    channel: str = "COMMAND"
    status: str | None = None
    reason: str = Field(default="", max_length=300)
    enabled: bool | None = None
    policy: dict[str, bool] | None = None
    checklist: dict[str, bool] | None = None
    handover: dict[str, str] | None = None
    speed: int = Field(default=1, ge=1, le=5)


@router.post("/api/hospital-command/{hid}/{action}")
def command(hid: str, action: str, body: Action, request: Request):
    _, role = authorize(request, hid, True, action)

    def run(city):
        ops = ensure(city, hid)
        incident = (
            service.find(city, "incidents", body.incidentId)
            if body.incidentId
            else None
        )
        if incident and incident["hospitalId"] != hid:
            raise HTTPException(403, "Patient belongs to another hospital")
        patient_actions = {
            "prepare",
            "reserve",
            "acknowledge",
            "divert",
            "handover-start",
            "handover-save",
            "receive",
            "team-ready",
            "substitute",
        }
        if action in patient_actions and not incident:
            raise HTTPException(422, "Select an incoming patient")
        if action == "prepare":
            if role in {"BLOOD_BANK", "RADIOLOGY"}:
                raise HTTPException(
                    403, "Receiving-team preparation permission required"
                )
            return prepare(city, ops, incident)
        if action == "reserve":
            if role == "BLOOD_BANK" and body.kind != "BLOOD":
                raise HTTPException(403, "Blood bank may reserve blood only")
            if role == "RADIOLOGY" and body.kind not in {"CT", "MRI", "XRAY"}:
                raise HTTPException(403, "Radiology may reserve imaging only")
            return reserve(city, ops, incident, body.kind)
        if action == "acknowledge":
            if incident["status"] == "HOSPITAL_ASSIGNED":
                service.hospital_accept(city, incident)
            audit(city, ops, "acknowledged", incident)
        elif action == "divert":
            service.hospital_reject(
                city, incident, body.reason or "Hospital requests diversion"
            )
            release(city, ops, incident["id"])
            audit(city, ops, "diversion.requested", incident, reason=body.reason)
        elif action == "message":
            if not body.text.strip():
                raise HTTPException(422, "Message cannot be empty")
            if body.channel not in {"COMMAND", "TEAM"}:
                raise HTTPException(422, "Unknown channel")
            ops["messages"].append(
                {
                    "id": uid("MSG"),
                    "incidentId": body.incidentId,
                    "sender": role,
                    "text": body.text.strip(),
                    "channel": body.channel,
                    "createdAt": now(),
                }
            )
            ops["messages"] = ops["messages"][-300:]
            audit(
                city,
                ops,
                "message.sent",
                incident,
                text=body.text,
                channel=body.channel,
            )
        elif action in {"team-ready", "substitute"}:
            prep = prep_for(ops, incident)
            team = next((t for t in ops["teams"] if t["id"] == prep["teamId"]), None)
            if not team:
                raise HTTPException(409, "Assign a receiving team first")
            member = next(
                (m for m in team["members"] if m["id"] == body.resourceId), None
            )
            if not member:
                raise HTTPException(404, "Staff member not found")
            if action == "substitute":
                if not ops["demo"]:
                    raise HTTPException(
                        409,
                        "Configure a confirmed available substitute before reassignment",
                    )
                if member["status"] != "UNAVAILABLE":
                    raise HTTPException(409, "Staff member is not unavailable")
                member.update(
                    name="Dr. Pranav"
                    if member["role"] == "Anesthetist"
                    else "Available substitute",
                    status="READY",
                    etaSeconds=0,
                )
            else:
                if member["status"] == "UNAVAILABLE":
                    raise HTTPException(409, "Substitute unavailable staff first")
                member.update(status="READY", etaSeconds=0)
            if all(m["status"] == "READY" for m in team["members"]):
                next(t for t in prep["tasks"] if t["id"] == "TEAM")["status"] = "READY"
                prep["status"] = (
                    "READY"
                    if all(t["status"] == "READY" for t in prep["tasks"])
                    else "PREPARING"
                )
            if prep["status"] == "READY":
                prep["readyAt"] = prep.get("readyAt") or now()
            audit(city, ops, "staff." + action, incident, staffId=member["id"])
        elif action == "resource-status":
            resource = next(
                (r for r in ops["resources"] if r["id"] == body.resourceId), None
            )
            if not resource:
                raise HTTPException(404, "Resource not found")
            if role == "RADIOLOGY" and resource["kind"] not in {"CT", "MRI", "XRAY"}:
                raise HTTPException(403, "Radiology may update imaging equipment only")
            if body.status not in {"AVAILABLE", "IN_USE", "UNAVAILABLE"}:
                raise HTTPException(422, "Invalid status")
            if resource["incidentId"] and resource["status"] == "RESERVED":
                raise HTTPException(
                    409,
                    "Reserved resource cannot be overridden; divert or cancel patient first",
                )
            resource.update(
                status=body.status, incidentId=None, patientId=None, updatedAt=now()
            )
            audit(
                city,
                ops,
                "resource.updated",
                resourceId=resource["id"],
                status=body.status,
            )
            synchronize(city)
            service.capacity_update(city, hid, {})
        elif action == "alert-ack":
            alert = next((a for a in ops["alerts"] if a["id"] == body.resourceId), None)
            if not alert:
                raise HTTPException(404, "Alert not found")
            alert["acknowledged"] = True
            audit(city, ops, "alert.acknowledged", alertId=alert["id"])
        elif action == "policy":
            if not body.policy or set(body.policy) - set(ops["policy"]):
                raise HTTPException(422, "Invalid acceptance policy")
            ops["policy"].update(body.policy)
            service.find(city, "hospitals", hid)["acceptancePolicy"] = ops["policy"]
            audit(city, ops, "policy.updated", policy=ops["policy"])
            service.capacity_update(city, hid, {})
        elif action == "diversion":
            if body.enabled and body.reason not in {
                "ICU FULL",
                "TRAUMA TEAM BUSY",
                "OT UNAVAILABLE",
                "MASS CASUALTY",
                "EQUIPMENT FAILURE",
            }:
                raise HTTPException(422, "Select a diversion reason")
            ops["diversionReason"] = body.reason if body.enabled else ""
            service.capacity_update(city, hid, {"diversion": bool(body.enabled)})
            audit(city, ops, "availability.updated", reason=ops["diversionReason"])
        elif action == "mass-casualty":
            ops["massCasualty"] = bool(body.enabled)
            audit(city, ops, "mass_casualty.updated", enabled=ops["massCasualty"])
        elif action == "handover-start":
            if incident["status"] != "ARRIVED_AT_HOSPITAL":
                raise HTTPException(409, "Ambulance has not reached the hospital")
            prep = prep_for(ops, incident)
            prep["handoverStartedAt"] = prep["handoverStartedAt"] or now()
            prep["status"] = "HANDOVER"
            audit(city, ops, "handover.started", incident)
        elif action == "handover-save":
            prep = prep_for(ops, incident)
            if not prep["handoverStartedAt"]:
                raise HTTPException(409, "Start handover first")
            allowed = {
                "Patient received",
                "Vitals confirmed",
                "Belongings received",
                "Documentation received",
                "Medication history reviewed",
            }
            if body.checklist and set(body.checklist) - allowed:
                raise HTTPException(422, "Invalid handover check")
            if body.handover and (
                set(body.handover)
                - {
                    "mechanism",
                    "injuries",
                    "signs",
                    "treatment",
                    "medications",
                    "allergies",
                    "history",
                    "notes",
                }
                or any(len(v) > 2000 for v in body.handover.values())
            ):
                raise HTTPException(422, "Invalid handover notes")
            prep["handoverChecklist"].update(body.checklist or {})
            prep["handover"].update(body.handover or {})
            audit(city, ops, "handover.saved", incident)
        elif action == "receive":
            prep = prep_for(ops, incident)
            if not prep["handoverStartedAt"] or not all(
                prep["handoverChecklist"].get(k)
                for k in [
                    "Patient received",
                    "Vitals confirmed",
                    "Documentation received",
                ]
            ):
                raise HTTPException(
                    409, "Start handover and confirm patient, vitals and documentation"
                )
            complete(city, ops, incident)
        elif action == "demo-start":
            if not demo_enabled():
                raise HTTPException(403, "Demo disabled")
            hospital = service.find(city, "hospitals", hid)
            if (
                hospital["diversion"]
                or not hospital["erAvailable"]
                or hospital["icuBeds"] <= len(hospital["reservations"])
                or "TRAUMA" not in hospital["specialists"]
                or not ops["policy"]["ROAD_ACCIDENT"]
            ):
                raise HTTPException(
                    409,
                    "Demo requires an accepting trauma hospital with available ICU capacity",
                )
            if any(
                i.get("hospitalDemoId") == hid and i["status"] not in service.TERMINAL
                for i in city["incidents"]
            ):
                raise HTTPException(409, "Hospital demo already has an active case")
            ops["demoControl"] = {
                "running": True,
                "elapsed": 0,
                "speed": 1,
                "applied": [],
                "incidentId": None,
            }
            audit(city, ops, "demo.started")
        elif action == "demo-control":
            if not demo_enabled():
                raise HTTPException(403, "Demo disabled")
            ops["demoControl"].update(running=bool(body.enabled), speed=body.speed)
        else:
            raise HTTPException(404, "Unknown hospital action")
        return ops

    return mutate(run)


def complete(city, ops, incident):
    prep = prep_for(ops, incident)
    service.handover(city, incident)
    prep.update(status="RECEIVED", receivedAt=now())
    for resource in ops["resources"]:
        if resource["incidentId"] == incident["id"]:
            resource["status"] = "IN_USE"
    for stock in ops["blood"].values():
        stock["reserved"].pop(incident["id"], None)
    duration = max(
        0,
        (
            datetime.fromisoformat(now())
            - datetime.fromisoformat(prep["handoverStartedAt"])
        ).total_seconds(),
    )
    prep["report"] = {
        "handoverSeconds": round(duration),
        "preparedBeforeArrival": bool(
            prep["startedAt"] and prep["startedAt"] < prep["handoverStartedAt"]
        ),
        "readyBeforeArrival": prep.get("readyAt") is not None
        and prep["readyAt"] < prep["handoverStartedAt"],
        "resourceIds": [
            r["id"] for r in ops["resources"] if r["incidentId"] == incident["id"]
        ],
        "simulation": bool(incident.get("hospitalDemoId")),
        "timeSavedSeconds": None,
    }
    ops["board"].append(
        {
            "incidentId": incident["id"],
            "patientId": incident["patientId"],
            "name": incident["patientName"],
            "priority": incident["severity"],
            "location": next(
                (
                    r["id"]
                    for r in ops["resources"]
                    if r["incidentId"] == incident["id"]
                    and r["kind"] in {"TRAUMA", "ER"}
                ),
                "Receiving bay",
            ),
            "teamId": prep["teamId"],
            "status": "UNDER_HOSPITAL_CARE",
            "receivedAt": prep["receivedAt"],
        }
    )
    audit(city, ops, "patient.received", incident, report=prep["report"])


def alert(city, ops, text, iid=None):
    if any(
        a["text"] == text and a["incidentId"] == iid and not a["acknowledged"]
        for a in ops["alerts"]
    ):
        return
    ops["alerts"].append(
        {
            "id": uid("ALERT"),
            "text": text,
            "incidentId": iid,
            "createdAt": now(),
            "acknowledged": False,
        }
    )
    ops["alerts"] = ops["alerts"][-100:]
    audit(city, ops, "alert.created", text=text, incidentId=iid)


def demo_stage(city, ops, elapsed):
    control = ops["demoControl"]
    hid = ops["hospitalId"]
    stages = [
        3,
        5,
        7,
        10,
        12,
        14,
        17,
        20,
        22,
        24,
        27,
        30,
        35,
        38,
        40,
        45,
        48,
        55,
        60,
        70,
        72,
        80,
        82,
    ]
    for second in stages:
        if elapsed < second or second in control["applied"]:
            continue
        incident = next(
            (i for i in city["incidents"] if i["id"] == control.get("incidentId")), None
        )
        if second == 3:
            alert(city, ops, "P1 critical incoming · DEMO")
        elif second == 5:
            hospital = service.find(city, "hospitals", hid)
            # Standalone scenario adds a dedicated eligible demo unit, never steals an active ambulance.
            template = city["ambulances"][1].copy()
            template.update(
                id=uid("SIM-AMB"),
                driverId=uid("SIM-DRV"),
                status="AVAILABLE",
                workload=0,
                sequence=0,
                location={
                    "latitude": hospital["location"]["latitude"] + 0.012,
                    "longitude": hospital["location"]["longitude"] + 0.014,
                },
                ready=True,
                activeShift=True,
                lastLocationAt=now(),
                capacity=2,
                crew=["ALS", "TRAUMA"],
                equipment=[
                    "TRAUMA_KIT",
                    "OXYGEN",
                    "DEFIBRILLATOR",
                    "VENTILATOR",
                    "MONITOR",
                ],
            )
            city["ambulances"].append(template)
            incident = service.create_incident(
                city,
                {
                    "submissionId": uid("HOSP-DEMO"),
                    "patientName": "Demo · Rohan",
                    "age": 32,
                    "location": template["location"].copy(),
                    "emergencyType": "ROAD_ACCIDENT",
                    "severity": "CRITICAL",
                    "description": "DEMO: road trauma, receiving-team preparation scenario",
                    "dispatchImmediately": False,
                },
            )
            incident.update(
                hospitalDemoId=hid,
                simulationStartedAt=now(),
                sex="Male",
                vitals={"hr": 132, "bp": "104/66", "spo2": 92, "rr": 28, "gcs": 8},
                notes="Demo paramedic report: oxygen, IV access, bleeding control. Clinician confirmation required.",
            )
            service.dispatch(city, incident, template["id"])
            control["incidentId"] = incident["id"]
        elif incident:
            if second == 7:
                service.acknowledge(city, incident["assignmentId"])
            elif second == 10:
                service.transition(city, incident, "ARRIVED_AT_PATIENT")
                service.transition(city, incident, "PATIENT_ONBOARD")
                service.transition(city, incident, "HOSPITAL_SELECTION")
                service.select_hospital(city, incident, hid)
            elif second == 12:
                if incident["status"] == "HOSPITAL_ASSIGNED":
                    service.hospital_accept(city, incident)
            elif second == 14:
                prepare(city, ops, incident)
            elif second in {17, 20, 22, 24, 27}:
                audit(city, ops, "demo.preparation.progress", incident, stage=second)
            elif second == 30:
                team = next(
                    (t for t in ops["teams"] if t["incidentId"] == incident["id"]), None
                )
                if team:
                    for member in team["members"]:
                        if member["status"] == "UNAVAILABLE":
                            member["name"] = "Dr. Pranav"
                            audit(
                                city,
                                ops,
                                "demo.staff.substituted",
                                incident,
                                staffId=member["id"],
                            )
                        member.update(status="READY", etaSeconds=0)
                prep = prep_for(ops, incident)
                next(t for t in prep["tasks"] if t["id"] == "TEAM")["status"] = "READY"
                prep["status"] = (
                    "READY"
                    if all(t["status"] == "READY" for t in prep["tasks"])
                    else "CONFLICT"
                )
                if prep["status"] == "READY":
                    prep["readyAt"] = now()
                if not incident.get("corridorId"):
                    service.activate_corridor(city, incident)
            elif second == 35:
                incident["vitals"].update(spo2=88, bp="92/58")
                incident["deteriorating"] = True
                assigned_team = next(
                    (t for t in ops["teams"] if t["incidentId"] == incident["id"]), None
                )
                if assigned_team:
                    anesthetist = next(
                        m
                        for m in assigned_team["members"]
                        if m["role"] == "Anesthetist"
                    )
                    anesthetist.update(status="UNAVAILABLE", etaSeconds=0)
                    next(
                        t for t in prep_for(ops, incident)["tasks"] if t["id"] == "TEAM"
                    )["status"] = "ASSEMBLING"
                    alert(
                        city,
                        ops,
                        "Demo staff conflict · anesthetist substitute available",
                        incident["id"],
                    )
                prep_for(ops, incident)
                alert(
                    city,
                    ops,
                    "Patient deterioration · airway equipment review required",
                    incident["id"],
                )
            elif second == 38:
                incident["vitals"].update(spo2=84, bp="82/50")
                prepare(city, ops, incident)
            elif second == 40:
                team = next(
                    (t for t in ops["teams"] if t["incidentId"] == incident["id"]), None
                )
                if team:
                    for member in team["members"]:
                        if member["status"] == "UNAVAILABLE":
                            member["name"] = "Dr. Pranav"
                            audit(
                                city,
                                ops,
                                "demo.staff.substituted",
                                incident,
                                staffId=member["id"],
                            )
                        member.update(status="READY", etaSeconds=0)
                prep = prep_for(ops, incident)
                next(t for t in prep["tasks"] if t["id"] == "TEAM")["status"] = "READY"
                prep["status"] = (
                    "READY"
                    if all(t["status"] == "READY" for t in prep["tasks"])
                    else "CONFLICT"
                )
                if prep["status"] == "READY":
                    prep["readyAt"] = now()
                audit(city, ops, "demo.airway.prepared", incident)
            elif second == 45:
                route = service.find(city, "routes", incident["routeId"])
                location = route["geometry"][len(route["geometry"]) // 2]
                demo_road = service.road_event(
                    city,
                    {
                        "type": "ROAD_BLOCKAGE",
                        "severity": "HIGH",
                        "description": "DEMO hospital-arrival route blockage",
                        "radiusMeters": 80,
                        "estimatedDelaySeconds": 120,
                        "source": "DEMO",
                        **location,
                    },
                )
                alert(
                    city,
                    ops,
                    "Route disruption detected; shared route recomputed",
                    incident["id"],
                )
                control["roadEventId"] = demo_road["id"]
            elif second == 48:
                demo_road = next(
                    (
                        r
                        for r in city["roadEvents"]
                        if r["id"] == control.get("roadEventId")
                    ),
                    None,
                )
                if demo_road:
                    demo_road["active"] = False
                    audit(
                        city,
                        ops,
                        "demo.obstruction.cleared",
                        incident,
                        roadEventId=demo_road["id"],
                    )
                if incident["status"] == "ROAD_BLOCKED":
                    service.transition(city, incident, "REROUTING")
                    route = service.update_route(
                        city,
                        incident,
                        "Demo obstruction cleared; resume hospital approach",
                    )
                    service.transition(
                        city,
                        incident,
                        "EN_ROUTE_TO_HOSPITAL"
                        if not route["blocked"]
                        else "ROAD_BLOCKED",
                    )
                else:
                    service.update_route(
                        city, incident, "Demo route review after simulated clearance"
                    )
                audit(
                    city,
                    ops,
                    "demo.route.recalculated",
                    incident,
                    etaSeconds=incident["etaSeconds"],
                )
            elif second == 55:
                audit(city, ops, "demo.final_approach", incident)
            elif second == 60:
                alert(
                    city, ops, "Final preparation · receiving bay check", incident["id"]
                )
            elif second == 70:
                service.transition(
                    city,
                    incident,
                    "ARRIVED_AT_HOSPITAL",
                    "ambulance.arrived.at.hospital",
                )
                incident["etaSeconds"] = 0
                audit(city, ops, "gate.arrival", incident)
            elif second == 72:
                prep = prep_for(ops, incident)
                prep["handoverStartedAt"] = now()
                prep["status"] = "HANDOVER"
                audit(city, ops, "handover.started", incident)
            elif second == 80:
                prep = prep_for(ops, incident)
                prep["handoverChecklist"] = {
                    k: True
                    for k in [
                        "Patient received",
                        "Vitals confirmed",
                        "Documentation received",
                    ]
                }
                complete(city, ops, incident)
            elif second == 82:
                control["running"] = False
                audit(city, ops, "demo.completed", incident)
        control["applied"].append(second)
    incident = next(
        (i for i in city["incidents"] if i["id"] == control.get("incidentId")), None
    )
    if incident and incident["status"] == "EN_ROUTE_TO_HOSPITAL":
        hospital = service.find(city, "hospitals", incident["hospitalId"])
        unit = service.find(city, "ambulances", incident["ambulanceId"])
        phase = max(0, min(1, (elapsed - 12) / 58))
        wiggle = 0.00035 * math.sin(phase * math.pi * 4)
        unit["location"] = {
            "latitude": hospital["location"]["latitude"] + 0.012 * (1 - phase) + wiggle,
            "longitude": hospital["location"]["longitude"] + 0.014 * (1 - phase),
        }
        unit.update(
            sequence=unit["sequence"] + 1, lastLocationAt=now(), speed=40, heading=220
        )
        incident["etaSeconds"] = max(0, 70 - elapsed)
        incident["distanceMeters"] = round(
            service.distance(unit["location"], hospital["location"])
        )
        audit(
            city,
            ops,
            "demo.location.updated",
            incident,
            location=unit["location"],
            etaSeconds=incident["etaSeconds"],
        )


def tick():
    city = read_city()
    if not city.get("hospitalOperations"):
        return

    def run(city):
        for hid, ops in city["hospitalOperations"].items():
            for incident in incoming(city, hid):
                prep_for(ops, incident)
            control = ops["demoControl"]
            demo_incident = next(
                (i for i in city["incidents"] if i["id"] == control.get("incidentId")),
                None,
            )
            if (
                demo_incident
                and demo_incident["status"] in service.TERMINAL
                and control["elapsed"] < 80
            ):
                control["running"] = False
            if control["running"]:
                control["elapsed"] += control["speed"]
                demo_stage(city, ops, control["elapsed"])
            for prep in ops["preparations"].values():
                if prep["conflicts"]:
                    alert(
                        city,
                        ops,
                        "Resource conflict: " + "; ".join(prep["conflicts"]),
                        prep["incidentId"],
                    )
            if ops["blood"]["O-"]["available"] < 3:
                alert(city, ops, "O− blood stock below demonstration threshold")
        synchronize(city)

    mutate(run)
