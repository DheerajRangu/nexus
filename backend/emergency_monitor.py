"""Operational failures enter the same durable lifecycle, never UI timers."""

from datetime import datetime, timezone
from backend.emergency_store import read_city, mutate
from backend import emergency_service as service


def check_deadlines():
    stamp = datetime.now(timezone.utc)
    city = read_city()
    overdue = [
        a["id"]
        for a in city["assignments"]
        if a["status"] == "NOTIFIED" and datetime.fromisoformat(a["deadlineAt"]) < stamp
    ]
    if not overdue:
        return

    def run(city):
        for key in overdue:
            assignment = service.find(city, "assignments", key)
            if assignment["status"] != "NOTIFIED":
                continue
            incident = service.find(city, "incidents", assignment["incidentId"])
            service.emit(
                city, "ambulance.acknowledgement.overdue", incident, assignmentId=key
            )
            service.reject(city, key, "Acknowledgement deadline expired")

    mutate(run)
