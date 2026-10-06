"""Connected journey uses the same API, persisted state and event history."""

import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import delete
from backend.main import app
from backend.database import Session, initialize
from backend.emergency_store import EmergencyCity, EmergencyOutbox, EmergencyAccess


def login(client, role="CONTROL_ROOM_OPERATOR", resource=None):
    r = client.post("/api/auth/session", json={"role": role, "resourceId": resource})
    assert r.status_code == 200, r.text


def clean():
    initialize()
    with Session.begin() as db:
        for table in [EmergencyCity, EmergencyOutbox, EmergencyAccess]:
            db.execute(delete(table))


def create(client):
    r = client.post(
        "/api/incidents",
        json={
            "submissionId": str(uuid.uuid4()),
            "patientName": "Demo patient",
            "location": {"latitude": 12.9716, "longitude": 77.5946},
            "emergencyType": "ROAD_ACCIDENT",
            "severity": "CRITICAL",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def state(client):
    return client.get("/api/ecosystem/state").json()["state"]


def action(client, incident, verb):
    r = client.post(f"/api/incidents/{incident}/{verb}", json={})
    assert r.status_code == 200, r.text
    return r.json()


def test_complete_connected_journey_road_reroute_and_hospital_capacity():
    clean()
    with (
        TestClient(app) as operator,
        TestClient(app) as driver,
        TestClient(app) as hospital,
        TestClient(app) as citizen,
    ):
        login(operator)
        assert operator.post("/api/demo/seed").status_code == 200
        created = create(citizen)
        incident_id = created["incidentId"]
        city = state(operator)
        incident = city["incidents"][0]
        assert incident["ambulanceId"] == "AMB-07"  # Nearer BLS unit excluded.
        assert incident["status"] == "EN_ROUTE_TO_PATIENT"
        login(driver, "AMBULANCE_DRIVER", "AMB-07")
        r = driver.post(
            "/api/assignments/" + incident["assignmentId"] + "/receipt", json={}
        )
        assert r.status_code == 200, r.text
        r = driver.post(
            "/api/assignments/"
            + incident["assignmentId"]
            + "/acknowledgement",
            json={},
        )
        assert r.status_code == 200, r.text
        assert (
            citizen.post(
                "/api/v1/citizen/sessions",
                json={"linkToken": created["trackingLink"].split("/")[-1]},
            ).status_code
            == 200
        )
        tracking = citizen.get("/api/v1/citizen/tracking").json()
        assert tracking["assignment"]["ambulanceId"] == "AMB-07"
        stamp = datetime.now(timezone.utc).isoformat()
        gps = {
            "location": {"latitude": 12.9728, "longitude": 77.5904},
            "sequence": 1,
            "timestamp": stamp,
        }
        assert (
            driver.post("/api/ambulances/AMB-07/location", json=gps).status_code == 200
        )
        assert (
            citizen.get("/api/v1/citizen/tracking").json()["telemetry"]["latitude"]
            == gps["location"]["latitude"]
        )
        assert state(operator)["ambulances"][2]["location"] == gps["location"]
        assert (
            driver.post("/api/ambulances/AMB-07/location", json=gps).status_code == 409
        )
        action(driver, incident_id, "arrived-patient")
        picked = action(driver, incident_id, "pickup")
        assert (
            picked["hospitalId"] != "HOSP-A"
        )  # Nearest cannot support critical trauma.
        hid = picked["hospitalId"]
        login(hospital, "HOSPITAL_OPERATOR", hid)
        accepted = action(hospital, incident_id, "hospital-accept")
        assert accepted["status"] == "EN_ROUTE_TO_HOSPITAL"
        city = state(operator)
        route = next(r for r in city["routes"] if r["id"] == accepted["routeId"])
        oldroute = route["id"]
        oldeta = accepted["etaSeconds"]
        oldcorr = city["corridors"][0]["version"]
        road = operator.post(
            "/api/road-events",
            json={
                **route["geometry"][1],
                "type": "ROAD_BLOCKAGE",
                "description": "Barricades on route",
                "radiusMeters": 150,
            },
        )
        assert road.status_code == 200, road.text
        city = state(operator)
        rerouted = city["incidents"][0]
        assert rerouted["routeId"] != oldroute
        assert rerouted["etaSeconds"] != oldeta
        current = next(r for r in city["routes"] if r["id"] == rerouted["routeId"])
        assert not current["blocked"]
        assert city["corridors"][0]["version"] > oldcorr
        assert state(driver)["incidents"][0]["routeId"] == rerouted["routeId"]
        assert state(hospital)["incidents"][0]["etaSeconds"] == rerouted["etaSeconds"]
        assert (
            citizen.get("/api/v1/citizen/tracking").json()["route"]["points"]
            == current["geometry"]
        )
        capacity = hospital.patch(
            "/api/hospitals/" + hid + "/capacity", json={"icuBeds": 0}
        )
        assert capacity.status_code == 200, capacity.text
        changed = state(operator)["incidents"][0]
        assert changed["hospitalId"] != hid
        login(hospital, "HOSPITAL_OPERATOR", changed["hospitalId"])
        action(hospital, incident_id, "hospital-accept")
        action(driver, incident_id, "arrived-hospital")
        completed = action(hospital, incident_id, "handover")
        assert completed["status"] == "COMPLETED"
        assert citizen.get("/api/v1/citizen/tracking").json()["phase"] == "COMPLETED"
        event_types = [e["type"] for e in completed["timeline"]]
        for kind in [
            "incident.created",
            "ambulance.assignment.confirmed",
            "ambulance.assignment.acknowledged",
            "ambulance.location.updated",
            "patient.picked_up",
            "hospital.selected",
            "hospital.accepted",
            "green_corridor.updated",
            "route.rerouted",
            "hospital.rejected",
            "emergency.completed",
        ]:
            assert kind in event_types
        assert state(operator)["corridors"][0]["status"] == "COMPLETED"
        assert state(operator)["ambulances"][2]["status"] == "AVAILABLE"


def test_driver_cannot_accept_or_reject_a_confirmed_assignment_and_role_isolation():
    clean()
    with (
        TestClient(app) as operator,
        TestClient(app) as driver,
        TestClient(app) as citizen,
    ):
        login(operator)
        operator.post("/api/demo/seed")
        created = create(citizen)
        incident = state(operator)["incidents"][0]
        login(driver, "AMBULANCE_DRIVER", "AMB-07")
        assert (
            driver.post(
            "/api/assignments/" + incident["assignmentId"] + "/reject",
            json={"reason": "Equipment issue"},
            ).status_code
            == 404
        )
        assert (
            driver.post(
                "/api/assignments/" + incident["assignmentId"] + "/accept", json={}
            ).status_code
            == 404
        )
        assert (
            driver.patch(
                "/api/hospitals/HOSP-B/capacity", json={"icuBeds": 0}
            ).status_code
            == 403
        )
        assert citizen.get("/api/ecosystem/state").status_code == 401
        assert (
            citizen.get("/api/v1/citizen/tracking?emergencyId=another").status_code
            == 403
        )
        login(driver, "AMBULANCE_DRIVER", "AMB-02")
        assert (
            driver.post(
                "/api/assignments/"
                + incident["assignmentId"]
                + "/acknowledgement",
                json={},
            ).status_code
            == 403
        )
        login(driver, "AMBULANCE_DRIVER", "AMB-07")
        assert (
            driver.post(
                "/api/assignments/"
                + incident["assignmentId"]
                + "/acknowledgement",
                json={},
            ).status_code
            == 200
        )
        assert (
            citizen.get("/api/v1/citizen/tracking").json()["assignment"]["ambulanceId"]
            == "AMB-07"
        )


def test_camera_bridge_real_evidence_event_reroutes_active_route():
    clean()
    from backend.vision_bridge import publish

    with (
        TestClient(app) as operator,
        TestClient(app) as driver,
        TestClient(app) as citizen,
    ):
        login(operator)
        operator.post("/api/demo/seed")
        create(citizen)
        i = state(operator)["incidents"][0]
        login(driver, "AMBULANCE_DRIVER", i["ambulanceId"])
        city = state(operator)
        i = city["incidents"][0]
        route = next(r for r in city["routes"] if r["id"] == i["routeId"])
        camera = operator.post(
            "/api/cameras",
            json={
                "name": "Route camera",
                "location": route["geometry"][1],
                "roadName": "Demo road",
            },
        ).json()
        event = {
            "eventId": "EVT-00001",
            "segment": 1,
            "eventType": "HAZARD_ROAD_CLOSURE_SCENE",
            "title": "Road blockage detected",
            "severity": "WARNING",
            "description": "Barricades visible",
            "confidence": 0.32,
            "confidenceType": "visual similarity",
            "evidence": {
                "event": {
                    "image": "/api/live/example/events/EVT-00001/event_annotated.jpg"
                }
            },
        }
        first = publish(camera["id"], "testsession", event)
        second = publish(camera["id"], "testsession", event)
        assert first["id"] == second["id"]
        city = state(operator)
        assert len(city["roadEvents"]) == 1
        assert city["incidents"][0]["routeId"] != route["id"]
        assert (
            city["roadEvents"][0]["evidenceImage"]
            == event["evidence"]["event"]["image"]
        )


def test_expired_token_and_invalid_transition():
    clean()
    from backend.emergency_store import access

    with TestClient(app) as client:
        login(client)
        client.post("/api/demo/seed")
        created = create(client)
        token = access("tracking", incident_id=created["incidentId"], seconds=-1)
        assert (
            client.post(
                "/api/v1/citizen/sessions", json={"linkToken": token}
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/api/incidents/" + created["incidentId"] + "/handover", json={}
            ).status_code
            == 403
        )


def test_driver_acknowledgement_overdue_does_not_reassign_and_native_contract_uses_shared_state():
    clean()
    from backend.emergency_monitor import check_deadlines
    from backend.emergency_store import mutate

    with (
        TestClient(app) as operator,
        TestClient(app) as driver,
        TestClient(app) as citizen,
    ):
        login(operator)
        operator.post("/api/demo/seed")
        create(citizen)

        def expire(city):
            city["assignments"][0]["acknowledgementDeadlineAt"] = "2020-01-01T00:00:00+00:00"

        mutate(expire)
        check_deadlines()
        incident = state(operator)["incidents"][0]
        assert incident["ambulanceId"] == "AMB-07"
        assert incident["status"] == "EN_ROUTE_TO_PATIENT"
        login(driver, "AMBULANCE_DRIVER", "AMB-07")
        native = driver.get("/api/v1/driver/me/snapshot").json()
        assert native["assignment"]["emergencyId"] == incident["id"]
        accepted = driver.post(
            "/api/v1/driver/assignments/"
            + incident["assignmentId"]
            + "/acknowledgement",
            json={},
        )
        assert accepted.status_code == 200
        assert (
            driver.get("/api/state").json()["state"]["emergencies"][0]["status"]
            == "EN_ROUTE_TO_PATIENT"
        )
        assert any(
            e["type"] == "ambulance.acknowledgement.overdue"
            for e in incident["timeline"]
        )


def test_irrelevant_road_event_does_not_reroute_and_state_survives_new_client():
    clean()
    with (
        TestClient(app) as operator,
        TestClient(app) as citizen,
        TestClient(app) as driver,
    ):
        login(operator)
        operator.post("/api/demo/seed")
        create(citizen)
        incident = state(operator)["incidents"][0]
        login(driver, "AMBULANCE_DRIVER", incident["ambulanceId"])
        original = state(operator)["incidents"][0]["routeId"]
        event = operator.post(
            "/api/road-events",
            json={
                "latitude": 13.5,
                "longitude": 78.5,
                "type": "ROAD_BLOCKAGE",
                "description": "Unrelated distant road",
            },
        )
        assert event.status_code == 200
        assert state(operator)["incidents"][0]["routeId"] == original
        assert event.json()["affectedIncidentIds"] == []
    with TestClient(app) as reconnected:
        login(reconnected)
        assert state(reconnected)["incidents"][0]["routeId"] == original


def test_parallel_dispatch_cannot_assign_one_unit_twice():
    clean()
    from concurrent.futures import ThreadPoolExecutor
    from backend.emergency_store import mutate, demo_seed, read_city
    from backend.emergency_service import create_incident

    mutate(lambda city: city.update(demo_seed()))

    def submit(number):
        return mutate(
            lambda city: create_incident(
                city,
                {
                    "submissionId": str(uuid.uuid4()),
                    "patientName": f"Demo {number}",
                    "phone": "",
                    "age": 30,
                    "location": {"latitude": 12.9716, "longitude": 77.5946},
                    "emergencyType": "ROAD_ACCIDENT",
                    "severity": "CRITICAL",
                    "description": "",
                },
            )
        )

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(submit, range(6)))
    assigned = [i["ambulanceId"] for i in results if i["ambulanceId"]]
    assert len(assigned) == 2
    assert len(set(assigned)) == len(assigned)
    assert len(read_city()["incidents"]) == 6
    assert sum(i["status"] == "CRITICAL_ESCALATION" for i in results) == 4


def test_blocked_route_recovery_and_cancellation_release_resources():
    clean()
    with (
        TestClient(app) as operator,
        TestClient(app) as driver,
        TestClient(app) as citizen,
    ):
        login(operator)
        operator.post("/api/demo/seed")
        create(citizen)
        incident = state(operator)["incidents"][0]
        login(driver, "AMBULANCE_DRIVER", incident["ambulanceId"])
        ambulance = next(
            a
            for a in state(operator)["ambulances"]
            if a["id"] == incident["ambulanceId"]
        )
        event = operator.post(
            "/api/road-events",
            json={
                **ambulance["location"],
                "type": "ROAD_CLOSURE",
                "description": "Closure across all outbound routes",
                "radiusMeters": 150,
            },
        ).json()
        assert state(operator)["incidents"][0]["status"] == "ROAD_BLOCKED"
        assert (
            operator.patch(
                "/api/road-events/" + event["id"], json={"active": False}
            ).status_code
            == 200
        )
        assert state(operator)["incidents"][0]["status"] == "EN_ROUTE_TO_PATIENT"
        action(driver, incident["id"], "arrived-patient")
        picked = action(driver, incident["id"], "pickup")
        assert picked["hospitalId"]
        assert (
            operator.post(
                "/api/incidents/" + incident["id"] + "/cancel", json={}
            ).status_code
            == 200
        )
        city = state(operator)
        ambulance = next(
            a for a in city["ambulances"] if a["id"] == incident["ambulanceId"]
        )
        assert ambulance["status"] == "AVAILABLE" and ambulance["workload"] == 0
        assert all(incident["id"] not in h["reservations"] for h in city["hospitals"])
        assert city["assignments"][0]["status"] == "CANCELLED"


def test_non_demo_rejects_bootstrap_without_key_and_both_citizen_intakes(monkeypatch):
    clean()
    with TestClient(app) as operator:
        login(operator)
        operator.post("/api/demo/seed")
        login(operator, "CITIZEN")
        monkeypatch.setenv("AEGIS_DEMO_MODE", "false")
        monkeypatch.setenv("AEGIS_OPERATOR_KEY", "unit-test-only-secret")
        assert (
            operator.post(
                "/api/auth/session", json={"role": "SYSTEM_ADMIN"}
            ).status_code
            == 401
        )
        assert (
            operator.post(
                "/api/action",
                json={
                    "action": "create",
                    "name": "Demo",
                    "location": {"latitude": 12.97, "longitude": 77.59},
                },
            ).status_code
            == 403
        )
        assert (
            operator.post(
                "/api/incidents",
                json={
                    "submissionId": str(uuid.uuid4()),
                    "patientName": "Demo",
                    "location": {"latitude": 12.97, "longitude": 77.59},
                },
            ).status_code
            == 403
        )
        assert (
            operator.post("/api/auth", json={"action": "register"}).status_code == 422
        )
