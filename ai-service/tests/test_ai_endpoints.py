from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "UP"

def test_intake_structuring():
    response = client.post("/api/v1/ai/intake/structure", json={
        "operatorNotes": "Caller reports 54 yo male having severe chest pain and breathlessness near central plaza",
        "callerLanguage": "en"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["chiefComplaint"] == "CARDIAC_ARREST"
    assert data["triagePriority"] == "P1_CRITICAL"
    assert data["patientAge"] == 54
    assert data["patientGender"] == "MALE"

def test_eta_predict():
    response = client.post("/api/v1/ai/eta/predict", json={
        "originLat": 12.9716,
        "originLng": 77.5946,
        "destLat": 12.9352,
        "destLng": 77.6245,
        "baseDistanceKm": 6.5,
        "baseEtaMins": 12.0,
        "trafficLevel": "HEAVY",
        "timeOfDayHour": 9
    })
    assert response.status_code == 200
    data = response.json()
    assert data["correctedEtaMins"] > 12.0
    assert data["modelVersion"] == "aegis-eta-regressor-v1"

def test_demand_forecast():
    response = client.get("/api/v1/ai/demand/forecast?sectorId=NORTH_ZONE&lookaheadHours=1")
    assert response.status_code == 200
    data = response.json()
    assert data["sectorId"] == "NORTH_ZONE"
    assert "predictedCalls" in data

def test_explain_recommendations():
    response = client.post("/api/v1/ai/explain/recommendations", json={
        "emergencyId": "emg-test-101",
        "candidates": [
            {"id": "AMB-01", "type": "AMBULANCE", "baseEtaMins": 8.0, "distanceKm": 3.2, "capabilityMatch": True}
        ]
    })
    assert response.status_code == 200
    data = response.json()
    assert len(data["rankedRationales"]) == 1
