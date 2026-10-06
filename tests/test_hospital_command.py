from fastapi.testclient import TestClient
from backend.main import app
from backend.emergency_store import read_city
from backend.hospital_command import tick
from tests.test_ecosystem import clean, login


def hospital_login(client, hid="HOSP-B", role="COMMANDER"):
    result = client.post(
        "/api/hospital-command/session", json={"resourceId": hid, "staffRole": role}
    )
    assert result.status_code == 200, result.text


def test_hospital_demo_preparation_deterioration_and_handover():
    clean()
    with TestClient(app) as client:
        login(client)
        assert client.post("/api/demo/seed").status_code == 200
        hospital_login(client)
        response = client.post("/api/hospital-command/HOSP-B/demo-start", json={})
        assert response.status_code == 200, response.text
        for _ in range(42):
            tick()
        city = read_city()
        ops = city["hospitalOperations"]["HOSP-B"]
        incident = next(i for i in city["incidents"] if i.get("hospitalDemoId"))
        assert incident["deteriorating"] and incident["vitals"]["spo2"] == 84
        prep = ops["preparations"][incident["id"]]
        assert {"VENTILATOR", "AIRWAY", "BLOOD"} <= {t["id"] for t in prep["tasks"]}
        assert ops["blood"]["O-"]["available"] == 4
        assert (
            len(
                {r["id"] for r in ops["resources"] if r["incidentId"] == incident["id"]}
            )
            >= 6
        )
        for _ in range(45):
            tick()
        city = read_city()
        incident = next(i for i in city["incidents"] if i.get("hospitalDemoId"))
        ops = city["hospitalOperations"]["HOSP-B"]
        assert incident["status"] == "COMPLETED"
        assert ops["board"][0]["status"] == "UNDER_HOSPITAL_CARE"
        assert ops["preparations"][incident["id"]]["report"]["timeSavedSeconds"] is None
        assert not ops["demoControl"]["running"]
        assert client.get("/api/system/health").status_code == 200


def test_hospital_scope_viewer_and_resource_permissions():
    clean()
    with TestClient(app) as client:
        login(client)
        assert client.post("/api/demo/seed").status_code == 200
        hospital_login(client, role="VIEWER")
        assert client.get("/api/hospital-command/HOSP-B").status_code == 200
        assert client.get("/api/hospital-command/HOSP-C").status_code == 403
        assert (
            client.patch(
                "/api/hospitals/HOSP-B/capacity", json={"icuBeds": 99}
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/hospital-command/HOSP-B/mass-casualty", json={"enabled": True}
            ).status_code
            == 403
        )
        hospital_login(client, role="RADIOLOGY")
        assert (
            client.post(
                "/api/hospital-command/HOSP-B/diversion",
                json={"enabled": True, "reason": "ICU FULL"},
            ).status_code
            == 403
        )
        hospital_login(client)
        assert (
            client.post(
                "/api/hospital-command/HOSP-B/policy",
                json={"policy": {"ROAD_ACCIDENT": False}},
            ).status_code
            == 200
        )
        assert not read_city()["hospitals"][1]["acceptancePolicy"]["ROAD_ACCIDENT"]
        assert (
            client.post("/api/hospital-command/HOSP-B/demo-start", json={}).status_code
            == 409
        )


def test_hospital_reservations_are_idempotent_and_locks_protected():
    clean()
    with TestClient(app) as client:
        login(client)
        assert client.post("/api/demo/seed").status_code == 200
        hospital_login(client)
        client.post("/api/hospital-command/HOSP-B/demo-start", json={})
        for _ in range(16):
            tick()
        ops = read_city()["hospitalOperations"]["HOSP-B"]
        iid = ops["demoControl"]["incidentId"]
        before = ops["blood"]["O-"]["available"]
        for _ in range(2):
            r = client.post(
                "/api/hospital-command/HOSP-B/reserve",
                json={"incidentId": iid, "kind": "BLOOD"},
            )
            assert r.status_code == 200, r.text
        assert (
            read_city()["hospitalOperations"]["HOSP-B"]["blood"]["O-"]["available"]
            == before
        )
        resource = next(r for r in ops["resources"] if r["status"] == "RESERVED")
        assert (
            client.post(
                "/api/hospital-command/HOSP-B/resource-status",
                json={"resourceId": resource["id"], "status": "AVAILABLE"},
            ).status_code
            == 409
        )
        assert (
            client.post(
                "/api/hospital-command/HOSP-B/receive", json={"incidentId": iid}
            ).status_code
            == 409
        )
        hospital_login(client, "HOSP-C")
        assert (
            client.post(
                "/api/hospital-command/HOSP-C/prepare", json={"incidentId": iid}
            ).status_code
            == 403
        )


def test_hospital_capacity_conflict_and_manual_handover():
    import copy
    from backend.emergency_store import mutate, uid

    clean()
    with TestClient(app) as client:
        assert client.post("/api/hospital-command/bootstrap").status_code == 200
        hospital_login(client)
        client.post("/api/hospital-command/HOSP-B/demo-start", json={})
        for _ in range(16):
            tick()
        city = read_city()
        ops = city["hospitalOperations"]["HOSP-B"]
        first = ops["demoControl"]["incidentId"]

        def second_case(city):
            ops = city["hospitalOperations"]["HOSP-B"]
            for r in ops["resources"]:
                if r["kind"] == "ICU" and r["status"] == "AVAILABLE":
                    r["status"] = "UNAVAILABLE"
            original = next(i for i in city["incidents"] if i["id"] == first)
            other = copy.deepcopy(original)
            other.update(
                id=uid("INC"), patientId=uid("PAT"), timeline=[], hospitalDemoId=None
            )
            city["incidents"].append(other)
            return other["id"]

        second = mutate(second_case)
        response = client.post(
            "/api/hospital-command/HOSP-B/prepare", json={"incidentId": second}
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "CONFLICT"
        icu = [
            r
            for r in read_city()["hospitalOperations"]["HOSP-B"]["resources"]
            if r["kind"] == "ICU" and r["status"] == "RESERVED"
        ]
        assert len(icu) == 1 and icu[0]["incidentId"] == first
        # Remove only the synthetic extra case, preserving the actual demo journey.
        mutate(
            lambda c: c["incidents"].remove(
                next(i for i in c["incidents"] if i["id"] == second)
            )
        )
        for _ in range(58):
            tick()
        assert (
            client.post(
                "/api/hospital-command/HOSP-B/handover-save",
                json={
                    "incidentId": first,
                    "checklist": {
                        "Patient received": True,
                        "Vitals confirmed": True,
                        "Documentation received": True,
                    },
                    "handover": {
                        "mechanism": "Demo road trauma",
                        "allergies": "Unknown",
                    },
                },
            ).status_code
            == 200
        )
        response = client.post(
            "/api/hospital-command/HOSP-B/receive", json={"incidentId": first}
        )
        assert response.status_code == 200, response.text
        tick()
        ops = read_city()["hospitalOperations"]["HOSP-B"]
        assert ops["preparations"][first]["status"] == "RECEIVED"
        assert not ops["demoControl"]["running"]


def test_command_room_and_hospital_share_messages():
    clean()
    with TestClient(app) as client:
        client.post("/api/hospital-command/bootstrap")
        hospital_login(client)
        client.post("/api/hospital-command/HOSP-B/demo-start", json={})
        for _ in range(16):
            tick()
        iid = read_city()["hospitalOperations"]["HOSP-B"]["demoControl"]["incidentId"]
        login(client)
        sent = client.post(
            "/api/command/incidents/" + iid + "/hospital-message",
            json={"text": "Confirm receiving bay readiness."},
        )
        assert sent.status_code == 200, sent.text
        hospital_login(client)
        ops = client.get("/api/hospital-command/HOSP-B").json()["operations"]
        assert ops["messages"][-1]["sender"] == "COMMAND_ROOM"
        reply = client.post(
            "/api/hospital-command/HOSP-B/message",
            json={
                "incidentId": iid,
                "text": "Receiving bay ready.",
                "channel": "COMMAND",
            },
        )
        assert reply.status_code == 200, reply.text
        login(client)
        snapshot = client.get("/api/ecosystem/state").json()["state"]
        assert (
            snapshot["hospitalOperations"]["HOSP-B"]["messages"][-1]["text"]
            == "Receiving bay ready."
        )
        assert "hospitalStaffGrants" not in snapshot
