"""Shared dispatch, patient, hospital, routing and corridor decisions."""

from datetime import datetime, timezone
from fastapi import HTTPException
from backend.emergency_contract import TRANSITIONS, TERMINAL
from backend.emergency_store import now, uid
from backend.emergency_routing import calculate, distance, intersects


def find(city, collection, key):
    item = next((x for x in city[collection] if x["id"] == key), None)
    if item is None:
        raise HTTPException(404, f"{collection} record not found")
    return item


def emit(city, kind, incident=None, **details):
    event = {
        "eventId": uid("EVT"),
        "type": kind,
        "incidentId": incident["id"] if incident else None,
        "occurredAt": now(),
        "details": details,
    }
    city["events"].append(event)
    if incident:
        incident["timeline"].append(event)
        incident["version"] += 1
        incident["updatedAt"] = event["occurredAt"]
    return event


def transition(city, incident, status, kind=None, **details):
    if status not in TRANSITIONS.get(incident["status"], set()):
        raise HTTPException(409, f"Cannot move {incident['status']} to {status}")
    incident["status"] = status
    vehicle_state = {
        "EN_ROUTE_TO_PATIENT": "EN_ROUTE_TO_PATIENT",
        "ARRIVED_AT_PATIENT": "AT_SCENE",
        "PATIENT_ONBOARD": "PATIENT_ONBOARD",
        "HOSPITAL_SELECTION": "PATIENT_ONBOARD",
        "HOSPITAL_ASSIGNED": "PATIENT_ONBOARD",
        "EN_ROUTE_TO_HOSPITAL": "EN_ROUTE_TO_HOSPITAL",
        "ARRIVED_AT_HOSPITAL": "ARRIVED",
        "ROAD_BLOCKED": "BLOCKED",
    }
    if incident.get("ambulanceId") and status in vehicle_state:
        find(city, "ambulances", incident["ambulanceId"])["status"] = vehicle_state[
            status
        ]
    emit(city, kind or "incident.updated", incident, status=status, **details)


def requirements(incident):
    critical = incident["severity"] in {"CRITICAL", "HIGH"}
    return {
        "equipment": ["OXYGEN"]
        + (
            ["TRAUMA_KIT", "VENTILATOR"]
            if critical and incident["emergencyType"] == "ROAD_ACCIDENT"
            else ["DEFIBRILLATOR"]
            if critical and incident["emergencyType"] == "CARDIAC"
            else []
        ),
        "crew": ["ALS"] if critical else ["BLS"],
        "capacity": max(incident.get("patientCount", 1), 2 if critical else 1),
    }


def ambulance_rankings(city, incident):
    required = requirements(incident)
    candidates = []
    for ambulance in city["ambulances"]:
        reasons = []
        if ambulance["status"] != "AVAILABLE":
            reasons.append("Vehicle unavailable")
        if not ambulance.get("ready"):
            reasons.append("Readiness not confirmed")
        if not ambulance.get("activeShift"):
            reasons.append("Driver not on shift")
        age = (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(ambulance["lastLocationAt"])
        ).total_seconds()
        if age > 120:
            reasons.append("Location stale")
        if ambulance["id"] in incident.get("rejectedAmbulances", []):
            reasons.append("Driver already rejected this incident")
        missing = set(required["equipment"]) - set(ambulance["equipment"])
        if missing:
            reasons.append("Missing equipment: " + ", ".join(sorted(missing)))
        if required["crew"] == ["ALS"] and "ALS" not in ambulance["crew"]:
            reasons.append("ALS crew unavailable")
        if required["crew"] == ["BLS"] and not {"BLS", "ALS"}.intersection(
            ambulance["crew"]
        ):
            reasons.append("Qualified medical crew unavailable")
        if ambulance["capacity"] < required["capacity"]:
            reasons.append("Transport capacity insufficient")
        route = calculate(
            ambulance["location"],
            incident["location"],
            city["roadEvents"],
            incident["severity"],
        )[0]
        if route["blocked"]:
            reasons.append("No accessible demo route")
        score = route["score"] + ambulance["workload"] * 60
        candidates.append(
            {
                "ambulanceId": ambulance["id"],
                "eligible": not reasons,
                "score": round(score),
                "normalizedScore": max(
                    0,
                    min(
                        100,
                        round(
                            100
                            - min(50, route["etaSeconds"] / 20)
                            - ambulance["workload"] * 5
                        ),
                    ),
                )
                if not reasons
                else 0,
                "etaSeconds": route["etaSeconds"],
                "distanceMeters": route["distanceMeters"],
                "exclusionReasons": reasons,
                "reasons": [
                    "Equipment and crew match",
                    f"{route['etaSeconds']}s traffic-adjusted demo ETA",
                    f"Workload {ambulance['workload']}",
                ],
                "required": required,
            }
        )
    return sorted(candidates, key=lambda c: (not c["eligible"], c["score"]))


def dispatch(city, incident, ambulance_id=None):
    transition(city, incident, "DISPATCHING")
    incident["dispatchCandidates"] = ambulance_rankings(city, incident)
    selected = next(
        (
            c
            for c in incident["dispatchCandidates"]
            if c["eligible"]
            and (ambulance_id is None or c["ambulanceId"] == ambulance_id)
        ),
        None,
    )
    if ambulance_id and selected is None:
        raise HTTPException(
            409, "Selected unit does not meet current dispatch requirements"
        )
    if not selected:
        transition(
            city,
            incident,
            "CRITICAL_ESCALATION",
            "dispatch.unavailable",
            reason="No eligible ambulance; operator action required",
        )
        return incident
    ambulance = find(city, "ambulances", selected["ambulanceId"])
    ambulance["status"] = "ASSIGNED"
    ambulance["workload"] += 1
    assignment = {
        "id": uid("ASN"),
        "incidentId": incident["id"],
        "ambulanceId": ambulance["id"],
        "driverId": ambulance["driverId"],
        "status": "NOTIFIED",
        "assignedAt": now(),
        "deadlineAt": datetime.fromtimestamp(
            datetime.now(timezone.utc).timestamp() + 60, timezone.utc
        ).isoformat(),
        "acceptedAt": None,
        "receivedAt": None,
    }
    city["assignments"].append(assignment)
    incident.update(ambulanceId=ambulance["id"], assignmentId=assignment["id"])
    transition(
        city,
        incident,
        "AMBULANCE_ASSIGNED",
        "ambulance.assigned",
        assignmentId=assignment["id"],
        ambulanceId=ambulance["id"],
        selection=selected,
    )
    transition(
        city,
        incident,
        "DRIVER_NOTIFIED",
        "ambulance.driver.notified",
        driverId=ambulance["driverId"],
    )
    return incident


def create_incident(city, body):
    existing = next(
        (e for e in city["incidents"] if e.get("submissionId") == body["submissionId"]),
        None,
    )
    if existing:
        return existing
    incident = {
        "id": uid("INC"),
        "patientId": uid("PAT"),
        "submissionId": body["submissionId"],
        "patientName": body["patientName"],
        "phone": body.get("phone", ""),
        "age": body.get("age", 0),
        "patientCount": body.get("patientCount", 1),
        "district": body.get("district", ""),
        "location": body["location"],
        "emergencyType": body["emergencyType"],
        "description": body.get("description", ""),
        "severity": body["severity"],
        "status": "CREATED",
        "version": 0,
        "createdAt": now(),
        "updatedAt": now(),
        "ambulanceId": None,
        "assignmentId": None,
        "hospitalId": None,
        "routeId": None,
        "corridorId": None,
        "etaSeconds": None,
        "distanceMeters": None,
        "timeline": [],
        "rejectedAmbulances": [],
        "rejectedHospitals": [],
        "vitals": {},
        "trackingTokenIssued": False,
        "simulation": city["simulation"],
        "simulationCreatedElapsed": city.get("simulationControl", {}).get("elapsed", 0),
        "locationVersion": 1,
    }
    city["incidents"].append(incident)
    emit(city, "incident.created", incident, location=incident["location"])
    if body.get("dispatchImmediately", True):
        dispatch(city, incident)
    else:
        incident["dispatchCandidates"] = ambulance_rankings(city, incident)
        emit(
            city,
            "ai.dispatch.recommended",
            incident,
            candidates=incident["dispatchCandidates"],
        )
    return incident


def current_assignment(city, assignment_id):
    assignment = find(city, "assignments", assignment_id)
    incident = find(city, "incidents", assignment["incidentId"])
    if incident["assignmentId"] != assignment_id:
        raise HTTPException(409, "Assignment was superseded")
    return assignment, incident


def accept(city, assignment_id):
    assignment, incident = current_assignment(city, assignment_id)
    if assignment["status"] == "ACCEPTED":
        return incident
    if assignment["status"] != "NOTIFIED":
        raise HTTPException(409, "Assignment no longer awaits acceptance")
    assignment.update(status="ACCEPTED", acceptedAt=now())
    transition(
        city,
        incident,
        "DRIVER_ACCEPTED",
        "ambulance.assignment.accepted",
        assignmentId=assignment_id,
    )
    transition(city, incident, "EN_ROUTE_TO_PATIENT")
    find(city, "ambulances", assignment["ambulanceId"])["status"] = (
        "EN_ROUTE_TO_PATIENT"
    )
    update_route(city, incident, "Driver accepted assignment")
    return incident


def reject(city, assignment_id, reason="Driver unavailable"):
    assignment, incident = current_assignment(city, assignment_id)
    if assignment["status"] != "NOTIFIED":
        raise HTTPException(409, "Only pending assignments may be rejected")
    assignment.update(status="REJECTED", reason=reason)
    ambulance = find(city, "ambulances", assignment["ambulanceId"])
    ambulance["status"] = "AVAILABLE"
    ambulance["workload"] = max(0, ambulance["workload"] - 1)
    incident["rejectedAmbulances"].append(ambulance["id"])
    transition(
        city,
        incident,
        "DRIVER_REJECTED",
        "ambulance.assignment.rejected",
        reason=reason,
    )
    transition(city, incident, "AMBULANCE_REASSIGNING")
    return dispatch(city, incident)


def destination(city, incident):
    return (
        find(city, "hospitals", incident["hospitalId"])["location"]
        if incident["hospitalId"]
        else incident["location"]
    )


def update_route(city, incident, reason):
    if not incident["ambulanceId"]:
        return None
    ambulance = find(city, "ambulances", incident["ambulanceId"])
    old = next((r for r in city["routes"] if r["id"] == incident["routeId"]), None)
    options = calculate(
        ambulance["location"],
        destination(city, incident),
        city["roadEvents"],
        incident["severity"],
        bool(
            incident["corridorId"]
            and find(city, "corridors", incident["corridorId"])["status"]
            in {"ACTIVE", "SUSPENDED_ROAD_BLOCKAGE"}
        ),
    )
    selected = options[0]
    route = {
        "id": uid("RTE"),
        "incidentId": incident["id"],
        "version": (old["version"] + 1) if old else 1,
        "createdAt": now(),
        "alternatives": options,
        **selected,
    }
    city["routes"].append(route)
    incident.update(
        routeId=route["id"],
        etaSeconds=None if selected["blocked"] else route["etaSeconds"],
        distanceMeters=route["distanceMeters"],
    )
    if incident["corridorId"]:
        corridor = find(city, "corridors", incident["corridorId"])
        if selected["blocked"] and corridor["status"] == "ACTIVE":
            corridor["status"] = "SUSPENDED_ROAD_BLOCKAGE"
            for signal in corridor["signals"]:
                signal.update(state="RED", priority="SUSPENDED")
            emit(
                city,
                "green_corridor.suspended",
                incident,
                reason="All candidate routes blocked",
            )
        elif (
            not selected["blocked"] and corridor["status"] == "SUSPENDED_ROAD_BLOCKAGE"
        ):
            corridor["status"] = "ACTIVE"
            emit(city, "green_corridor.resumed", incident)
    if selected["blocked"]:
        if incident["status"] in {
            "EN_ROUTE_TO_PATIENT",
            "EN_ROUTE_TO_HOSPITAL",
            "REROUTING",
        }:
            transition(
                city,
                incident,
                "ROAD_BLOCKED",
                "route.unavailable",
                reason="All alternatives obstructed",
            )
    emit(
        city,
        "route.rerouted" if old else "route.created",
        incident,
        routeId=route["id"],
        previousRouteId=old["id"] if old else None,
        reason=reason,
        etaSeconds=route["etaSeconds"],
    )
    if (
        incident["corridorId"]
        and find(city, "corridors", incident["corridorId"])["status"] == "ACTIVE"
    ):
        refresh_corridor(city, incident)
    return route


def hospital_rankings(city, incident):
    critical = incident["severity"] in {"CRITICAL", "HIGH"}
    trauma = incident["emergencyType"] == "ROAD_ACCIDENT"
    cardiac = incident["emergencyType"] == "CARDIAC"
    origin = (
        find(city, "ambulances", incident["ambulanceId"])["location"]
        if incident["ambulanceId"]
        else incident["location"]
    )
    rankings = []
    for hospital in city["hospitals"]:
        own = incident["id"] in hospital["reservations"]
        available = (
            hospital["icuBeds"] - len(hospital["reservations"]) + (1 if own else 0)
        )
        reasons = []
        if not hospital.get("acceptancePolicy", {}).get(incident["emergencyType"], True):
            reasons.append("Hospital acceptance policy excludes this emergency type")
        if hospital["diversion"] or not hospital["erAvailable"]:
            reasons.append("Emergency receiving unavailable")
        if hospital["id"] in incident["rejectedHospitals"]:
            reasons.append("Hospital rejected this incident")
        if critical and available <= 0:
            reasons.append("No unreserved ICU capacity")
        if (
            trauma
            and critical
            and (
                "TRAUMA" not in hospital["specialists"]
                or "CT" not in hospital["equipment"]
                or hospital["traumaBeds"] <= 0
            )
        ):
            reasons.append("Trauma team, bed or CT unavailable")
        if cardiac and "CARDIAC" not in hospital["specialists"]:
            reasons.append("Cardiac specialist unavailable")
        if hospital["doctors"] <= 0:
            reasons.append("No doctor on duty")
        route = calculate(
            origin, hospital["location"], city["roadEvents"], incident["severity"]
        )[0]
        if route["blocked"]:
            reasons.append("No accessible demo route")
        capability = (
            (30 if not reasons else 0)
            + (20 if available > 0 else 0)
            + (15 if "CT" in hospital["equipment"] else 0)
            + (15 if hospital["specialists"] else 0)
        )
        score = round(
            capability
            + 20 * (1 - hospital["workload"] / 100)
            - min(25, route["etaSeconds"] / 60)
        )
        rankings.append(
            {
                "hospitalId": hospital["id"],
                "name": hospital["name"],
                "eligible": not reasons,
                "score": score,
                "etaSeconds": route["etaSeconds"],
                "distanceMeters": route["distanceMeters"],
                "availableIcuBeds": available,
                "exclusionReasons": reasons,
                "reasons": [
                    f"{available} unreserved ICU beds",
                    ", ".join(hospital["specialists"]),
                    ", ".join(hospital["equipment"]),
                    f"{hospital['workload']}% workload",
                ],
            }
        )
    return sorted(
        rankings, key=lambda x: (not x["eligible"], -x["score"], x["etaSeconds"])
    )


def release_reservation(city, incident):
    for hospital in city["hospitals"]:
        if incident["id"] in hospital["reservations"]:
            hospital["reservations"].remove(incident["id"])


def select_hospital(city, incident, hospital_id=None):
    if incident["status"] not in {
        "HOSPITAL_SELECTION",
        "HOSPITAL_ASSIGNED",
        "HOSPITAL_REJECTED",
        "EN_ROUTE_TO_HOSPITAL",
        "HOSPITAL_ACCEPTED",
        "GREEN_CORRIDOR_ACTIVE",
        "ROAD_BLOCKED",
    }:
        raise HTTPException(409, "Patient must be onboard before hospital selection")
    prior_status = incident["status"]
    was_travelling = prior_status in {
        "EN_ROUTE_TO_HOSPITAL",
        "ROAD_BLOCKED",
    } or incident.get("resumeHospitalTravel", False)
    if prior_status != "HOSPITAL_SELECTION":
        if prior_status != "HOSPITAL_REJECTED":
            transition(
                city, incident, "HOSPITAL_REJECTED", "hospital.assignment.reconsidered"
            )
        transition(city, incident, "HOSPITAL_SELECTION")
    rankings = hospital_rankings(city, incident)
    incident["hospitalRankings"] = rankings
    emit(city, "hospital.rankings.updated", incident, rankings=rankings)
    selected = next(
        (
            h
            for h in rankings
            if h["eligible"] and (hospital_id is None or h["hospitalId"] == hospital_id)
        ),
        None,
    )
    release_reservation(city, incident)
    if not selected:
        incident["hospitalId"] = None
        transition(city, incident, "CRITICAL_ESCALATION", "hospital.unavailable")
        return incident
    hospital = find(city, "hospitals", selected["hospitalId"])
    if incident["severity"] in {"CRITICAL", "HIGH"}:
        hospital["reservations"].append(incident["id"])
    incident["hospitalId"] = hospital["id"]
    incident["resumeHospitalTravel"] = was_travelling
    if incident["corridorId"]:
        corridor = find(city, "corridors", incident["corridorId"])
        corridor["status"] = "PENDING_HOSPITAL_ACCEPTANCE"
        for signal in corridor["signals"]:
            signal.update(state="RED", priority="PENDING")
    transition(
        city,
        incident,
        "HOSPITAL_ASSIGNED",
        "hospital.selected",
        hospitalId=hospital["id"],
        selection=selected,
    )
    update_route(city, incident, "Hospital destination selected")
    return incident


def pickup(city, incident):
    transition(city, incident, "PATIENT_ONBOARD", "patient.picked_up")
    transition(city, incident, "HOSPITAL_SELECTION")
    select_hospital(city, incident)
    return incident


def hospital_accept(city, incident):
    transition(
        city,
        incident,
        "HOSPITAL_ACCEPTED",
        "hospital.accepted",
        hospitalId=incident["hospitalId"],
    )
    if incident["severity"] in {"CRITICAL", "HIGH"}:
        activate_corridor(city, incident)
        transition(
            city,
            incident,
            "GREEN_CORRIDOR_ACTIVE",
            "green_corridor.activated",
            corridorId=incident["corridorId"],
        )
    transition(city, incident, "EN_ROUTE_TO_HOSPITAL")
    update_route(city, incident, "Hospital accepted; destination confirmed")
    return incident


def hospital_reject(city, incident, reason):
    hid = incident["hospitalId"]
    incident["resumeHospitalTravel"] = incident["status"] in {
        "EN_ROUTE_TO_HOSPITAL",
        "ROAD_BLOCKED",
    }
    incident["rejectedHospitals"].append(hid)
    transition(
        city,
        incident,
        "HOSPITAL_REJECTED",
        "hospital.rejected",
        hospitalId=hid,
        reason=reason,
    )
    release_reservation(city, incident)
    select_hospital(city, incident)
    return incident


def activate_corridor(city, incident):
    if not incident["corridorId"]:
        corridor = {
            "id": uid("GC"),
            "incidentId": incident["id"],
            "status": "ACTIVE",
            "version": 0,
            "simulation": True,
            "signals": [],
        }
        city["corridors"].append(corridor)
        incident["corridorId"] = corridor["id"]
    find(city, "corridors", incident["corridorId"])["status"] = "ACTIVE"
    refresh_corridor(city, incident)


def refresh_corridor(city, incident):
    corridor = find(city, "corridors", incident["corridorId"])
    route = find(city, "routes", incident["routeId"])
    corridor["version"] += 1
    corridor["routeId"] = route["id"]
    corridor["signals"] = []
    points = route["geometry"]
    for n in range(1, 5):
        fraction = n / 5
        point = {
            "latitude": points[0]["latitude"]
            + (points[-1]["latitude"] - points[0]["latitude"]) * fraction,
            "longitude": points[0]["longitude"]
            + (points[-1]["longitude"] - points[0]["longitude"]) * fraction,
        }
        # Waypoints follow the selected route, including its detour bend.
        segment = 0 if fraction < 0.5 else 1
        t = fraction * 2 if segment == 0 else (fraction - 0.5) * 2
        point = {
            key: points[segment][key]
            + (points[segment + 1][key] - points[segment][key]) * t
            for key in ["latitude", "longitude"]
        }
        corridor["signals"].append(
            {
                "id": f"{corridor['id']}-S{n}",
                "location": point,
                "etaSeconds": round(route["etaSeconds"] * fraction),
                "priority": "GRANTED",
                "state": "GREEN",
                "windowSeconds": 35,
                "simulation": True,
            }
        )
    emit(
        city,
        "green_corridor.updated",
        incident,
        version=corridor["version"],
        routeId=route["id"],
    )


def location_update(city, ambulance_id, body):
    ambulance = find(city, "ambulances", ambulance_id)
    if body["sequence"] <= ambulance["sequence"]:
        raise HTTPException(409, "Telemetry is duplicate or out of order")
    stamp = datetime.fromisoformat(body["timestamp"].replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - stamp).total_seconds()
    if age > 120 or age < -15:
        raise HTTPException(422, "Telemetry timestamp is stale or in the future")
    if ambulance["sequence"] and distance(
        ambulance["location"], body["location"]
    ) > max(
        300,
        (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(ambulance["lastLocationAt"])
        ).total_seconds()
        * 65,
    ):
        raise HTTPException(422, "Implausible GPS jump; restore accurate location")
    ambulance.update(
        location=body["location"],
        sequence=body["sequence"],
        lastLocationAt=body["timestamp"],
        heading=body.get("heading", 0),
        speed=body.get("speed", 0),
    )
    incident = next(
        (
            e
            for e in city["incidents"]
            if e["ambulanceId"] == ambulance_id and e["status"] not in TERMINAL
        ),
        None,
    )
    if not incident:
        return ambulance
    emit(city, "ambulance.location.updated", incident, ambulanceId=ambulance_id, **body)
    if incident["routeId"]:
        route = find(city, "routes", incident["routeId"])
        remaining = distance(ambulance["location"], destination(city, incident))
        if not intersects(
            route["geometry"], {**ambulance["location"], "radiusMeters": 250}
        ) and incident["status"] in {"EN_ROUTE_TO_PATIENT", "EN_ROUTE_TO_HOSPITAL"}:
            update_route(city, incident, "Ambulance deviated from route")
        else:
            incident["etaSeconds"] = round(
                route["etaSeconds"]
                * min(1, remaining / max(1, route["distanceMeters"]))
            )
            incident["distanceMeters"] = round(remaining)
            emit(
                city,
                "route.eta.updated",
                incident,
                etaSeconds=incident["etaSeconds"],
                distanceMeters=incident["distanceMeters"],
            )
        if (
            incident["corridorId"]
            and find(city, "corridors", incident["corridorId"])["status"] == "ACTIVE"
        ):
            refresh_corridor(city, incident)
    return incident


def capacity_update(city, hospital_id, body):
    hospital = find(city, "hospitals", hospital_id)
    hospital.update(body)
    emit(city, "hospital.capacity.updated", hospitalId=hospital_id, capacity=body)
    for incident in city["incidents"]:
        if incident["status"] in TERMINAL or not incident["hospitalId"]:
            continue
        rankings = hospital_rankings(city, incident)
        incident["hospitalRankings"] = rankings
        emit(city, "hospital.rankings.updated", incident, rankings=rankings)
        chosen = next(
            (h for h in rankings if h["hospitalId"] == incident["hospitalId"]), None
        )
        if (
            incident["hospitalId"] == hospital_id
            and chosen
            and not chosen["eligible"]
            and incident["status"]
            in {
                "HOSPITAL_ASSIGNED",
                "HOSPITAL_ACCEPTED",
                "GREEN_CORRIDOR_ACTIVE",
                "EN_ROUTE_TO_HOSPITAL",
                "ROAD_BLOCKED",
            }
        ):
            hospital_reject(
                city, incident, "Capacity or required capability no longer available"
            )
    return hospital


def road_event(city, body):
    existing = next(
        (
            e
            for e in city["roadEvents"]
            if body.get("sourceEventId")
            and e.get("sourceEventId") == body["sourceEventId"]
        ),
        None,
    )
    if existing:
        return existing
    event = {
        "id": uid("ROAD"),
        "active": True,
        "detectedAt": now(),
        "affectedIncidentIds": [],
        **body,
    }
    city["roadEvents"].append(event)
    emit(city, "road.event.detected", roadEventId=event["id"], event=event)
    for incident in city["incidents"]:
        if (
            incident["status"] not in {"EN_ROUTE_TO_PATIENT", "EN_ROUTE_TO_HOSPITAL"}
            or not incident["routeId"]
        ):
            continue
        route = find(city, "routes", incident["routeId"])
        if not intersects(route["geometry"], event):
            continue
        event["affectedIncidentIds"].append(incident["id"])
        resume = incident["status"]
        incident["resumeJourney"] = resume
        emit(city, "road.route.impacted", incident, roadEventId=event["id"])
        transition(city, incident, "REROUTING")
        new = update_route(city, incident, "Road event " + event["id"])
        if not new["blocked"]:
            transition(city, incident, resume)
    return event


def handover(city, incident):
    transition(city, incident, "PATIENT_HANDOVER", "patient.handover")
    transition(city, incident, "COMPLETED", "emergency.completed")
    ambulance = find(city, "ambulances", incident["ambulanceId"])
    ambulance["status"] = "AVAILABLE"
    ambulance["workload"] = max(0, ambulance["workload"] - 1)
    hospital = find(city, "hospitals", incident["hospitalId"])
    if incident["id"] in hospital["reservations"]:
        hospital["reservations"].remove(incident["id"])
        hospital["icuBeds"] = max(0, hospital["icuBeds"] - 1)
    if incident["corridorId"]:
        corridor = find(city, "corridors", incident["corridorId"])
        corridor["status"] = "COMPLETED"
        for signal in corridor["signals"]:
            signal.update(state="RED", priority="RELEASED")
        emit(city, "green_corridor.completed", incident, corridorId=corridor["id"])
    incident["etaSeconds"] = 0
    return incident
