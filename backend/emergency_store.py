"""Persistent city aggregate with compare-and-swap transactions and durable outbox.

Retains the control-room aggregate pattern on the existing SQLAlchemy DB. Every
mutation and its event entries commit together; competing dispatches retry.
"""

import copy, hashlib, json, secrets, time
from datetime import datetime, timezone
from sqlalchemy import String, JSON, Integer, Float, update
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.exc import IntegrityError, OperationalError
from backend.database import Base, Session


class EmergencyCity(Base):
    __tablename__ = "emergency_city"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[dict] = mapped_column(JSON)


class EmergencyOutbox(Base):
    __tablename__ = "emergency_outbox"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, index=True)
    incident_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    event_type: Mapped[str] = mapped_column(String, index=True)
    data: Mapped[dict] = mapped_column(JSON)


class EmergencyAccess(Base):
    __tablename__ = "emergency_access"
    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String)
    incident_id: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String, nullable=True)
    expires: Mapped[float] = mapped_column(Float)


def now():
    return datetime.now(timezone.utc).isoformat()


def uid(prefix):
    return prefix + "-" + secrets.token_hex(5).upper()


def hashed(value):
    return hashlib.sha256(value.encode()).hexdigest()


def demo_seed():
    fleet = []
    for number, lat, lon, als in [
        (1, 12.9718, 77.5948, False),
        (2, 12.966, 77.589, True),
        (7, 12.973, 77.59, True),
    ]:
        aid = f"AMB-{number:02}"
        fleet.append(
            {
                "id": aid,
                "driverId": f"DRV-{number:02}",
                "status": "AVAILABLE",
                "location": {"latitude": lat, "longitude": lon},
                "equipment": ["OXYGEN", "DEFIBRILLATOR"]
                + (["TRAUMA_KIT", "VENTILATOR", "MONITOR"] if als else []),
                "crew": ["ALS", "TRAUMA"] if als else ["BLS"],
                "capacity": 2 if als else 1,
                "ready": True,
                "activeShift": True,
                "workload": 0,
                "lastLocationAt": now(),
                "sequence": 0,
                "heading": 0,
                "speed": 0,
            }
        )
    hospitals = []
    for hid, name, lat, lon, icu, trauma, specialists in [
        ("HOSP-A", "City General", 12.974, 77.598, 0, False, ["GENERAL"]),
        (
            "HOSP-B",
            "Metro Trauma Centre",
            12.985,
            77.615,
            3,
            True,
            ["TRAUMA", "CARDIAC", "NEURO"],
        ),
        (
            "HOSP-C",
            "Regional Emergency Centre",
            12.959,
            77.62,
            2,
            True,
            ["TRAUMA", "CARDIAC", "NEURO"],
        ),
    ]:
        hospitals.append(
            {
                "id": hid,
                "name": name,
                "location": {"latitude": lat, "longitude": lon},
                "icuBeds": icu,
                "generalBeds": 12,
                "traumaBeds": 3 if trauma else 0,
                "erAvailable": True,
                "equipment": ["CT", "VENTILATOR", "BLOOD", "OT"]
                if trauma
                else ["XRAY"],
                "specialists": specialists,
                "doctors": 4,
                "workload": 30,
                "diversion": False,
                "reservations": [],
            }
        )
    return {
        "incidents": [],
        "ambulances": fleet,
        "hospitals": hospitals,
        "assignments": [],
        "routes": [],
        "roadEvents": [],
        "cameras": [],
        "corridors": [],
        "signals": [],
        "events": [],
        "simulation": True,
    }


def read_city():
    with Session() as db:
        row = db.get(EmergencyCity, "city")
        if row:
            return {**copy.deepcopy(row.data), "revision": row.revision}
    return {
        "incidents": [],
        "ambulances": [],
        "hospitals": [],
        "assignments": [],
        "routes": [],
        "roadEvents": [],
        "cameras": [],
        "corridors": [],
        "signals": [],
        "events": [],
        "simulation": False,
        "revision": 0,
    }


def mutate(fn):
    for attempt in range(8):
        try:
            with Session.begin() as db:
                row = db.get(EmergencyCity, "city", with_for_update=True)
                if row is None:
                    row = EmergencyCity(id="city", revision=0, data=read_city())
                    db.add(row)
                    db.flush()
                revision = row.revision
                city = copy.deepcopy(row.data)
                before = len(city["events"])
                result = fn(city)
                if city.get("hospitalOperations"):
                    from backend.hospital_command import synchronize
                    synchronize(city)
                next_revision = revision + 1
                changed = db.execute(
                    update(EmergencyCity)
                    .where(
                        EmergencyCity.id == "city", EmergencyCity.revision == revision
                    )
                    .values(data=city, revision=next_revision)
                )
                if changed.rowcount != 1:
                    db.rollback()
                    continue
                for event in city["events"][before:]:
                    db.add(
                        EmergencyOutbox(
                            id=event["eventId"],
                            revision=next_revision,
                            incident_id=event.get("incidentId"),
                            event_type=event["type"],
                            data=event,
                        )
                    )
                return copy.deepcopy(result)
        except IntegrityError as error:
            # Concurrent first mutation can race to create the singleton city.
            if "emergency_city" not in str(error):
                raise
        except OperationalError as error:
            if (
                "locked" not in str(error).lower()
                and "serialize" not in str(error).lower()
            ):
                raise
        time.sleep(0.01 * (attempt + 1))
    from fastapi import HTTPException

    raise HTTPException(409, "Concurrent city update; retry request")


def access(kind, incident_id=None, role=None, resource_id=None, seconds=3600):
    token = secrets.token_urlsafe(32)
    with Session.begin() as db:
        db.add(
            EmergencyAccess(
                token_hash=hashed(token),
                kind=kind,
                incident_id=incident_id,
                role=role,
                resource_id=resource_id,
                expires=time.time() + seconds,
            )
        )
    return token


def resolve(token, kind):
    if not token:
        return None
    with Session() as db:
        row = db.get(EmergencyAccess, hashed(token))
        if not row or row.kind != kind or row.expires < time.time():
            return None
        return {
            "incidentId": row.incident_id,
            "role": row.role,
            "resourceId": row.resource_id,
            "expires": row.expires,
        }
