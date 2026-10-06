"""The city demo drives the authoritative lifecycle; controls are server actions."""

from fastapi.testclient import TestClient
from backend.main import app
from backend.command_simulation import tick
from backend.emergency_store import read_city, mutate
from tests.test_ecosystem import clean, login, state


def test_city_seed_scale_pause_movement_and_websocket():
    clean()
    with TestClient(app) as client:
        login(client)
        seeded = client.post("/api/demo/start")
        assert seeded.status_code == 200, seeded.text
        city = state(client)
        assert [
            len(city[k])
            for k in [
                "ambulances",
                "hospitals",
                "cameras",
                "incidents",
                "roadEvents",
                "corridors",
            ]
        ] == [22, 12, 18, 6, 8, 2]
        assert city["cityName"] == "Hyderabad"
        assert (
            sum(a["status"] == "EN_ROUTE_TO_HOSPITAL" for a in city["ambulances"]) == 2
        )
        assert (
            client.patch("/api/demo/control", json={"running": False}).status_code
            == 200
        )
        old = read_city()
        tick()
        assert read_city()["revision"] == old["revision"]
        assert (
            client.patch(
                "/api/demo/control", json={"running": True, "speed": 5}
            ).status_code
            == 200
        )
        old = read_city()["ambulances"][0]["location"]
        tick()
        assert read_city()["ambulances"][0]["location"] != old
        assert (
            client.patch("/api/demo/control", json={"running": False}).status_code
            == 200
        )
        with client.websocket_connect(
            "/ws/command", headers={"origin": "http://localhost:5173"}
        ) as socket:
            packet = socket.receive_json()
            assert packet["type"] == "state"
            assert packet["state"]["cityName"] == "Hyderabad"
        assert client.get("/api/system/health").status_code == 200


def test_simulated_camera_and_operator_alerts_reach_shared_state():
    clean()
    with TestClient(app) as client:
        login(client)
        client.post("/api/demo/start")
        client.patch("/api/demo/control", json={"running": False})
        city = state(client)
        incident = next(
            i for i in city["incidents"] if i["status"] == "EN_ROUTE_TO_HOSPITAL"
        )
        oldroute = incident["routeId"]
        road = client.post(
            "/api/demo/event",
            json={"type": "CAMERA_ALERT", "incidentId": incident["id"]},
        )
        assert road.status_code == 200, road.text
        city = state(client)
        assert city["cameras"][0]["detection"]["simulation"]
        assert city["incidents"][0]["routeId"] != oldroute
        assert road.json()["source"] == "DEMO_CAMERA"
        event = next(e for e in city["events"] if e["type"] == "camera.detection")
        assert (
            client.post(
                "/api/command/alerts/" + event["eventId"] + "/acknowledge"
            ).status_code
            == 200
        )
        assert state(client)["alertStatus"][event["eventId"]] == "acknowledge"
        assert (
            client.post(
                "/api/command/incidents/" + incident["id"] + "/hospital-alert", json={}
            ).status_code
            == 200
        )
        assert (
            client.post(
                "/api/command/incidents/" + incident["id"] + "/contact", json={}
            ).status_code
            == 200
        )
        timeline = state(client)["incidents"][0]["timeline"]
        assert any(e["type"] == "hospital.prearrival.alert" for e in timeline)
        assert any(e["type"] == "operator.contact.requested" for e in timeline)
        assert (
            client.post(
                "/api/demo/event",
                json={"type": "ICU_FULL", "incidentId": incident["id"]},
            ).status_code
            == 200
        )
        assert state(client)["incidents"][0]["hospitalId"] != incident["hospitalId"]


def test_simulation_progresses_to_handover_without_frontend_timers():
    clean()
    with TestClient(app) as client:
        login(client)
        client.post("/api/demo/start")
        client.patch("/api/demo/control", json={"running": False, "speed": 5})

        # Tick manually for deterministic acceptance; disable random traffic branch.
        def prepare(city):
            city["simulationControl"].update(running=True, tick=-10000)
            for e in city["roadEvents"]:
                e["active"] = False

        mutate(prepare)
        # Reset tick before each frame to avoid unrelated periodic random events.
        for n in range(100):
            mutate(lambda city: city["simulationControl"].update(tick=-10000))
            tick()
            if all(i["status"] == "COMPLETED" for i in read_city()["incidents"]):
                break
        city = read_city()
        assert any(i["status"] == "COMPLETED" for i in city["incidents"])
        completed = next(i for i in city["incidents"] if i["status"] == "COMPLETED")
        assert any(e["type"] == "patient.handover" for e in completed["timeline"])
        client.patch("/api/demo/control", json={"running": False})


def test_driver_cannot_control_city_simulation():
    clean()
    with TestClient(app) as operator, TestClient(app) as driver:
        login(operator)
        operator.post("/api/demo/start")
        operator.patch("/api/demo/control", json={"running": False})
        login(driver, "AMBULANCE_DRIVER", "AMB-07")
        assert driver.post("/api/demo/reset").status_code == 403
        assert (
            driver.post("/api/demo/event", json={"type": "ACCIDENT"}).status_code == 403
        )
        assert (
            driver.patch("/api/demo/control", json={"chaos": True}).status_code == 403
        )


def test_manual_dispatch_ranks_then_checks_eligibility():
    clean()
    with TestClient(app) as operator:
        login(operator)
        operator.post("/api/demo/start")
        operator.patch("/api/demo/control", json={"running": False})
        created = operator.post(
            "/api/incidents",
            json={
                "submissionId": "operator-manual-123",
                "patientName": "Operator demo",
                "location": {"latitude": 17.448, "longitude": 78.391},
                "emergencyType": "ROAD_ACCIDENT",
                "severity": "CRITICAL",
                "dispatchImmediately": False,
                "patientCount": 2,
                "district": "Madhapur",
            },
        ).json()
        incident = next(
            i for i in state(operator)["incidents"] if i["id"] == created["incidentId"]
        )
        assert incident["status"] == "CREATED" and not incident["ambulanceId"]
        assert incident["patientCount"] == 2 and incident["district"] == "Madhapur"
        excluded = next(c for c in incident["dispatchCandidates"] if not c["eligible"])
        assert (
            operator.post(
                "/api/command/incidents/" + incident["id"] + "/dispatch",
                json={"ambulanceId": excluded["ambulanceId"]},
            ).status_code
            == 409
        )
        chosen = next(c for c in incident["dispatchCandidates"] if c["eligible"])
        assigned = operator.post(
            "/api/command/incidents/" + incident["id"] + "/dispatch",
            json={"ambulanceId": chosen["ambulanceId"]},
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["ambulanceId"] == chosen["ambulanceId"]


def test_demo_resources_unit_status_and_corridor_api_are_authoritative():
    clean()
    with TestClient(app) as operator, TestClient(app) as driver:
        login(operator)
        operator.post("/api/demo/start")
        operator.patch("/api/demo/control", json={"running": False})
        city = state(operator)
        unit = next(a for a in city["ambulances"] if a["status"] == "AVAILABLE")
        resources = operator.get("/api/demo/resources")
        assert resources.status_code == 200
        assert len(resources.json()["hospitals"]) == 12
        assert len(operator.get("/api/cameras").json()) == 18
        assert (
            operator.post(
                "/api/ambulances/" + unit["id"] + "/status", json={"status": "OFFLINE"}
            ).status_code
            == 200
        )
        assert (
            operator.get("/api/ambulances/" + unit["id"]).json()["status"] == "OFFLINE"
        )
        assert (
            operator.post(
                "/api/ambulances/" + unit["id"] + "/status",
                json={"status": "AVAILABLE"},
            ).status_code
            == 200
        )
        case = next(
            i for i in city["incidents"] if i["status"] == "EN_ROUTE_TO_HOSPITAL"
        )
        assert (
            operator.post(
                "/api/ambulances/" + case["ambulanceId"] + "/status",
                json={"status": "OFFLINE"},
            ).status_code
            == 409
        )
        assert (
            operator.delete("/api/corridors/" + case["corridorId"]).status_code == 200
        )
        assert state(operator)["corridors"][0]["status"] == "CANCELLED"
        assert (
            operator.post("/api/corridors", json={"incidentId": case["id"]}).status_code
            == 200
        )
        assert state(operator)["corridors"][0]["status"] == "ACTIVE"
        assert (
            operator.get("/api/system/health").headers["X-Content-Type-Options"]
            == "nosniff"
        )
        login(driver, "AMBULANCE_DRIVER", case["ambulanceId"])
        assert (
            driver.post(
                "/api/ambulances/" + unit["id"] + "/status", json={"status": "OFFLINE"}
            ).status_code
            == 403
        )
