"""City-scale demo driver. All simulated decisions use shared lifecycle services."""

import math
import random
from datetime import datetime, timezone
from backend.emergency_store import demo_seed, mutate, now, read_city, uid
from backend import emergency_service as service

DISTRICTS = [
    ("Banjara Hills", 17.415, 78.435),
    ("Jubilee Hills", 17.431, 78.407),
    ("Madhapur", 17.448, 78.391),
    ("Gachibowli", 17.440, 78.349),
    ("Hitech City", 17.450, 78.380),
    ("Secunderabad", 17.440, 78.498),
    ("Begumpet", 17.444, 78.465),
    ("Kukatpally", 17.485, 78.413),
    ("Mehdipatnam", 17.395, 78.442),
    ("LB Nagar", 17.347, 78.553),
]


def point(index, offset=0):
    name, lat, lon = DISTRICTS[index % len(DISTRICTS)]
    return {"latitude": lat + offset, "longitude": lon + offset}


def new_incident(city, kind="ROAD_ACCIDENT", index=2, severity="CRITICAL"):
    incident = service.create_incident(
        city,
        {
            "submissionId": uid("DEMO"),
            "patientName": "Demo patient " + str(len(city["incidents"]) + 1),
            "age": 32,
            "phone": "",
            "location": point(index, 0.002),
            "emergencyType": kind,
            "severity": severity,
            "description": "Simulated emergency · " + DISTRICTS[index % 10][0],
        },
    )
    incident.update(
        district=DISTRICTS[index % 10][0], patientCount=1, simulationStartedAt=now()
    )
    return incident


def seed_command(city):
    old = city
    if any(
        i["status"] not in service.TERMINAL and not i.get("simulationStartedAt")
        for i in old["incidents"]
    ):
        from fastapi import HTTPException

        raise HTTPException(
            409,
            "Finish or cancel existing non-command-demo incidents before resetting the city",
        )
    history = city["events"]
    staff_grants = city.get("hospitalStaffGrants", {})
    base = demo_seed()
    city.clear()
    city.update(base)
    city["events"] = history
    city["hospitalStaffGrants"] = staff_grants
    city["cityName"] = "Hyderabad"
    city["simulationControl"] = {
        "running": True,
        "speed": 1,
        "auto": True,
        "chaos": False,
        "tick": 0,
        "elapsed": 0,
    }
    fleet = base["ambulances"]
    city["ambulances"] = []
    for n in range(22):
        template = fleet[1 if n % 4 else 0].copy()
        template.update(
            id=f"AMB-{n + 1:02}",
            driverId=f"DRV-{n + 1:02}",
            location={
                "latitude": point(n)["latitude"]
                + 0.003 * (n // 10)
                + 0.0015 * math.sin(n * 2),
                "longitude": point(n)["longitude"] + 0.004 * math.cos(n * 2),
            },
            sequence=0,
            lastLocationAt=now(),
            status="AVAILABLE",
            workload=0,
            driverName=["Ravi", "Anil", "Sana", "Priya", "Arjun", "Sameer"][n % 6],
            vehicleNumber=f"TS09 DEMO {1000 + n}",
            fuel=75 - n % 15,
            type="ALS" if n % 4 else "BLS",
        )
        city["ambulances"].append(template)
    names = [
        "Apollo Demo",
        "Yashoda Demo",
        "CARE Demo",
        "KIMS Demo",
        "Continental Demo",
        "AIG Demo",
        "Sunshine Demo",
        "City Emergency Demo",
        "Metro Trauma Demo",
        "Deccan Medical Demo",
        "Regional Care Demo",
        "AEGIS Teaching Demo",
    ]
    city["hospitals"] = []
    for n, name in enumerate(names):
        h = base["hospitals"][1].copy()
        h.update(
            id=f"HOSP-{n + 1:02}",
            name=name,
            location=point(n, 0.018),
            icuBeds=4 + n % 5,
            generalBeds=12 + n,
            traumaBeds=3 + n % 4,
            workload=30 + n * 4,
            reservations=[],
            doctors=3 + n % 5,
        )
        city["hospitals"].append(h)
    city["cameras"] = [
        {
            "id": f"CAM-{n + 1:02}",
            "name": DISTRICTS[n % 10][0] + " Checkpoint",
            "roadName": DISTRICTS[n % 10][0] + " demo road",
            "location": point(n, -0.002 + 0.004 * (n // 10)),
            "status": "ONLINE",
            "lastEventId": None,
            "detection": None,
        }
        for n in range(18)
    ]
    city["alerts"] = []
    city["audit"] = []
    for n in range(8):
        service.road_event(
            city,
            {
                "type": "CONGESTION" if n % 2 else "CONSTRUCTION",
                **point(n, 0.015),
                "source": "DEMO",
                "severity": "HIGH",
                "description": "Initial simulated road condition",
                "radiusMeters": 100,
                "estimatedDelaySeconds": 90,
            },
        )
    for n in range(6):
        i = new_incident(
            city,
            ["ROAD_ACCIDENT", "CARDIAC", "STROKE", "BREATHING"][n % 4],
            n,
            "CRITICAL" if n < 2 else "HIGH",
        )
        if n < 2:
            service.acknowledge(city, i["assignmentId"])
            service.transition(city, i, "ARRIVED_AT_PATIENT", "patient.arrived")
            service.pickup(city, i)
            if i["hospitalId"]:
                service.hospital_accept(city, i)
    service.emit(city, "simulation.started", cityName="Hyderabad", mode="DEMO")
    return city


def trigger(city, kind, incident_id=None):
    incident = next(
        (i for i in city["incidents"] if i["id"] == incident_id), None
    ) or next(
        (
            i
            for i in city["incidents"]
            if i["status"] in {"EN_ROUTE_TO_PATIENT", "EN_ROUTE_TO_HOSPITAL"}
        ),
        None,
    )
    if kind in {"ACCIDENT", "CARDIAC", "MULTI_INCIDENT"}:
        return [
            new_incident(
                city,
                "CARDIAC" if kind == "CARDIAC" else "ROAD_ACCIDENT",
                random.randrange(10),
            )
            for _ in range(3 if kind == "MULTI_INCIDENT" else 1)
        ]
    if kind == "ICU_FULL":
        if not incident or not incident["hospitalId"]:
            from fastapi import HTTPException

            raise HTTPException(409, "Select an incident with an assigned hospital")
        return service.capacity_update(city, incident["hospitalId"], {"icuBeds": 0})
    if kind == "GREEN_CORRIDOR":
        if not incident or incident["status"] != "EN_ROUTE_TO_HOSPITAL":
            from fastapi import HTTPException

            raise HTTPException(409, "Hospital must accept an onboard patient first")
        service.activate_corridor(city, incident)
        service.update_route(city, incident, "Operator activated demo corridor")
        return incident
    route = next(
        (r for r in city["routes"] if incident and r["id"] == incident["routeId"]), None
    )
    location = route["geometry"][1] if route else point(2)
    road_type = {
        "TRAFFIC": "CONGESTION",
        "ROADBLOCK": "ROAD_BLOCKAGE",
        "CAMERA_ALERT": "CONSTRUCTION",
    }.get(kind, kind)
    body = {
        "type": road_type,
        **location,
        "source": "DEMO_CAMERA" if kind == "CAMERA_ALERT" else "DEMO",
        "severity": "HIGH",
        "description": "Simulated "
        + road_type.lower().replace("_", " ")
        + " on selected route",
        "radiusMeters": 100,
        "estimatedDelaySeconds": 300,
    }
    if kind == "CAMERA_ALERT":
        camera = city["cameras"][0]
        camera["location"] = location
        body["cameraId"] = camera["id"]
        camera["detection"] = {
            "type": "CONSTRUCTION",
            "timestamp": now(),
            "simulation": True,
            "vehicleQueue": 18,
            "averageSpeedKph": 12,
        }
        service.emit(
            city,
            "camera.detection",
            cameraId=camera["id"],
            detection=camera["detection"],
        )
    return service.road_event(city, body)


def tick():
    control = read_city().get("simulationControl")
    if not control or not control["running"]:
        return

    def run(city):
        control = city["simulationControl"]
        if not control["running"]:
            return
        step = control["speed"]
        control["tick"] += 1
        control["elapsed"] += step
        for ambulance in city["ambulances"]:
            if ambulance["status"] == "AVAILABLE":
                p = ambulance["location"]
                ambulance.update(
                    location={
                        "latitude": p["latitude"]
                        + 0.000025 * math.sin(control["tick"] / 12),
                        "longitude": p["longitude"]
                        + 0.000025 * math.cos(control["tick"] / 12),
                    },
                    lastLocationAt=now(),
                    speed=18,
                    heading=(control["tick"] * 8) % 360,
                    sequence=ambulance["sequence"] + 1,
                )
        for incident in list(city["incidents"]):
            if incident["status"] in service.TERMINAL or incident.get("hospitalDemoId"):
                continue
            status = incident["status"]
            phase = incident.get("simulationPhaseAge", 0) + step
            incident["simulationPhaseAge"] = phase
            if status == "EN_ROUTE_TO_PATIENT" and control["auto"] and phase >= 4 and not service.find(city, "assignments", incident["assignmentId"]).get("acknowledgedAt"):
                service.acknowledge(city, incident["assignmentId"])
                incident["simulationPhaseAge"] = 0
            elif status in {"EN_ROUTE_TO_PATIENT", "EN_ROUTE_TO_HOSPITAL"}:
                a = service.find(city, "ambulances", incident["ambulanceId"])
                route = service.find(city, "routes", incident["routeId"])
                origin = a["location"]
                if incident.get("simulationRouteId") != route["id"]:
                    incident["simulationRouteId"] = route["id"]
                    incident["simulationWaypoint"] = 1
                waypoint = incident.get("simulationWaypoint", 1)
                if service.distance(origin, route["geometry"][waypoint]) < 80:
                    waypoint = min(waypoint + 1, len(route["geometry"]) - 1)
                    incident["simulationWaypoint"] = waypoint
                target = route["geometry"][waypoint]
                length = service.distance(origin, target)
                fraction = min(1, min(250, step * 13.3) / max(1, length))
                location = {
                    k: origin[k] + (target[k] - origin[k]) * fraction for k in origin
                }
                service.location_update(
                    city,
                    a["id"],
                    {
                        "location": location,
                        "sequence": a["sequence"] + 1,
                        "timestamp": now(),
                        "speed": 48,
                        "heading": math.degrees(
                            math.atan2(
                                target["longitude"] - origin["longitude"],
                                target["latitude"] - origin["latitude"],
                            )
                        )
                        % 360,
                    },
                )
                if (
                    service.distance(location, route["geometry"][-1]) < 80
                    and control["auto"]
                ):
                    service.transition(
                        city,
                        incident,
                        "ARRIVED_AT_PATIENT"
                        if status == "EN_ROUTE_TO_PATIENT"
                        else "ARRIVED_AT_HOSPITAL",
                        "patient.arrived"
                        if status == "EN_ROUTE_TO_PATIENT"
                        else "ambulance.arrived.at.hospital",
                    )
                    incident["simulationPhaseAge"] = 0
            elif status == "ARRIVED_AT_PATIENT" and control["auto"] and phase >= 3:
                service.pickup(city, incident)
                incident["simulationPhaseAge"] = 0
            elif status == "HOSPITAL_ASSIGNED" and control["auto"] and phase >= 3:
                service.hospital_accept(city, incident)
                incident["simulationPhaseAge"] = 0
            elif status == "ARRIVED_AT_HOSPITAL" and control["auto"] and phase >= 3:
                service.handover(city, incident)
                elapsed = max(
                    0, control["elapsed"] - incident.get("simulationCreatedElapsed", 0)
                )
                own_routes = [
                    r for r in city["routes"] if r["incidentId"] == incident["id"]
                ]
                savings = (
                    max(
                        [max(0, round(r["etaSeconds"] * 0.12)) for r in own_routes]
                        or [0]
                    )
                    if incident["corridorId"]
                    else 0
                )
                incident["completionReport"] = {
                    "responseSeconds": elapsed,
                    "corridorEstimateSeconds": savings,
                    "hospitalId": incident["hospitalId"],
                    "simulation": True,
                    "routeRecomputations": len(own_routes),
                }
                service.emit(
                    city,
                    "mission.report.created",
                    incident,
                    report=incident["completionReport"],
                )
                incident["simulationPhaseAge"] = 0
            if incident["corridorId"]:
                c = service.find(city, "corridors", incident["corridorId"])
                if c["status"] == "ACTIVE":
                    for n, s in enumerate(c["signals"]):
                        s["state"] = (
                            "GREEN"
                            if n == (control["tick"] // 3) % 4
                            else "AMBER"
                            if n == ((control["tick"] // 3) + 1) % 4
                            else "RED"
                        )
                        s["priority"] = (
                            "GREEN_WINDOW"
                            if s["state"] == "GREEN"
                            else "PREPARING"
                            if s["state"] == "AMBER"
                            else "WAITING"
                        )
        if control["tick"] % 20 == 0:
            h = city["hospitals"][(control["tick"] // 20) % len(city["hospitals"])]
            service.capacity_update(
                city,
                h["id"],
                {
                    "workload": min(
                        95, max(10, h["workload"] + random.choice([-5, 5]))
                    ),
                    "icuBeds": max(
                        len(h["reservations"]), h["icuBeds"] + random.choice([-1, 1])
                    ),
                },
            )
        if control["tick"] % 35 == 0:
            trigger(city, "CAMERA_ALERT")
        if (
            control["chaos"]
            and control["tick"] % 12 == 0
            and len(
                [i for i in city["incidents"] if i["status"] not in service.TERMINAL]
            )
            < 18
        ):
            new_incident(city, index=random.randrange(10))

    mutate(run)
