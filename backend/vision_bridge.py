"""Located vision findings become road events in the same durable emergency state."""

from backend.emergency_store import read_city, mutate
from backend import emergency_service as service


def publish(camera_id, session_id, event):
    if event.get("severity") not in {"WARNING", "CRITICAL", "NOTICE"}:
        return
    kind = event["eventType"]
    category = (
        "ACCIDENT_AFTERMATH"
        if any(k in kind for k in ["ACCIDENT_AFTERMATH", "CRASHED_VEHICLE"])
        else "ACCIDENT"
        if "POSSIBLE_INCIDENT" in kind
        else "ROAD_BLOCKAGE"
        if any(
            k in kind
            for k in ["ROAD_CLOSURE", "ROAD_BLOCK", "LANE_RESTRICTION", "FALLEN_TREE"]
        )
        else "CONSTRUCTION"
        if kind == "CONSTRUCTION_EVIDENCE"
        else "CONGESTION"
        if kind in {"GRIDLOCK_OBSERVED", "SUDDEN_TRAFFIC_DISRUPTION"}
        else None
    )
    if not category:
        return

    def run(city):
        camera = service.find(city, "cameras", camera_id)
        body = {
            "type": category,
            "severity": "CRITICAL"
            if category in {"ACCIDENT", "ACCIDENT_AFTERMATH"}
            else "HIGH",
            "description": event["description"],
            **camera["location"],
            "radiusMeters": 150,
            "estimatedDelaySeconds": 300 if category == "CONSTRUCTION" else 600,
            "confidence": event.get("confidence"),
            "confidenceType": event.get("confidenceType"),
            "roadName": camera["roadName"],
            "source": "CAMERA",
            "cameraId": camera_id,
            "sourceEventId": session_id
            + ":"
            + str(event["segment"])
            + ":"
            + event["eventId"],
            "evidenceImage": event.get("evidence", {}).get("event", {}).get("image"),
        }
        existing = next(
            (
                r
                for r in city["roadEvents"]
                if r.get("sourceEventId") == body["sourceEventId"]
            ),
            None,
        )
        if existing:
            return existing
        road = service.road_event(city, body)
        camera["lastEventId"] = road["id"]
        service.emit(
            city, "camera.event.detected", cameraId=camera_id, roadEventId=road["id"]
        )
        return road

    return mutate(run)
