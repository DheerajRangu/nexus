"""Explicitly simulated route provider, with real geographic intersection checks.

Provider geometry is a demo road graph, not verified street navigation. No invented
traffic probabilities. Production adapters must supply authorized street routes.
"""

import math


def distance(a, b):
    lat1, lat2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dl = math.radians(b["longitude"] - a["longitude"])
    dp = lat2 - lat1
    return (
        6371000
        * 2
        * math.asin(
            min(
                1,
                math.sqrt(
                    math.sin(dp / 2) ** 2
                    + math.cos(lat1) * math.cos(lat2) * math.sin(dl / 2) ** 2
                ),
            )
        )
    )


def near_segment(point, a, b, radius=150):
    latitude = math.radians(point["latitude"])
    scale = 111320

    def xy(p):
        return (
            (p["longitude"] - point["longitude"]) * scale * math.cos(latitude),
            (p["latitude"] - point["latitude"]) * scale,
        )

    ax, ay = xy(a)
    bx, by = xy(b)
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, -(ax * dx + ay * dy) / max(1, dx * dx + dy * dy)))
    return math.hypot(ax + t * dx, ay + t * dy) <= radius


def intersects(points, event):
    return any(
        near_segment(event, a, b, event.get("radiusMeters", 150))
        for a, b in zip(points, points[1:])
    )


def calculate(origin, destination, events, severity="MODERATE", corridor=False):
    mid = {
        "latitude": (origin["latitude"] + destination["latitude"]) / 2,
        "longitude": (origin["longitude"] + destination["longitude"]) / 2,
    }
    candidates = []
    for label, offset in [
        ("DIRECT", 0),
        ("NORTH", 0.006),
        ("SOUTH", -0.006),
        ("EAST", 0.008),
        ("WEST", -0.008),
    ]:
        bend = {**mid}
        if label in {"EAST", "WEST"}:
            bend["longitude"] += offset
        else:
            bend["latitude"] += offset
        points = [origin, bend, destination]
        affected = [
            e for e in events if e.get("active", True) and intersects(points, e)
        ]
        blocked = any(
            e["type"] in {"ROAD_BLOCKAGE", "ROAD_CLOSURE", "FLOODING"} for e in affected
        )
        length = sum(distance(a, b) for a, b in zip(points, points[1:]))
        base = max(60, round(length / 8.3))
        delay = sum(e.get("estimatedDelaySeconds", 120) for e in affected)
        risk = sum(
            240 if e["type"] in {"ACCIDENT", "ACCIDENT_AFTERMATH"} else 90
            for e in affected
        )
        benefit = round(base * 0.12) if corridor else 0
        eta = max(30, base + delay - benefit)
        candidates.append(
            {
                "candidateId": label,
                "geometry": points,
                "distanceMeters": round(length),
                "etaSeconds": eta,
                "blocked": blocked,
                "score": eta + risk * (1.5 if severity == "CRITICAL" else 1),
                "roadEventIds": [e["id"] for e in affected],
                "reasons": [
                    f"{label.lower()} demonstration route",
                    f"{len(affected)} road events intersect",
                    f"{delay}s observed-event delay penalty",
                ],
                "provider": "DEMO_GRAPH",
                "simulation": True,
            }
        )
    candidates.sort(key=lambda c: (c["blocked"], c["score"]))
    return candidates
