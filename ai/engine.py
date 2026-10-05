"""Pure road metrics. Pixel motion is never represented as physical speed."""
import math
import cv2
import numpy as np

LEVELS = ["CLEAR", "LOW", "MODERATE", "HEAVY", "SEVERE"]

def inside(center, polygon):
    return cv2.pointPolygonTest(np.asarray(polygon, np.float32), tuple(map(float, center)), False) >= 0

def occupancy(boxes, polygon, width, height):
    # Union of clipped boxes avoids double counting overlapping detections.
    scale = min(1, 640 / width)
    shape = (max(1, round(height * scale)), max(1, round(width * scale)))
    road = np.zeros(shape, np.uint8)
    occupied = np.zeros(shape, np.uint8)
    cv2.fillPoly(road, [np.round(np.asarray(polygon) * scale).astype(np.int32)], 1)
    for x1, y1, x2, y2 in boxes:
        a, b, c, d = np.round(np.asarray([x1,y1,x2,y2])*scale).astype(int)
        occupied[max(0,b):min(shape[0],d),max(0,a):min(shape[1],c)] = 1
    return float(np.count_nonzero(occupied & road) / max(1, np.count_nonzero(road)))

def traffic(count, occupied, stopped_ratio, motion, config):
    low_speed = max(0, 1 - motion / config["free_flow_px_sec"]) if count else 0
    weights=config.get("traffic_weights", {"density":.1,"occupancy":.35,"stopped":.3,"low_motion":.25})
    return min(1, weights["density"] * min(1, count / config["vehicle_capacity"]) + weights["occupancy"] * occupied + weights["stopped"] * stopped_ratio + weights["low_motion"] * low_speed)

def level(score, thresholds):
    return LEVELS[sum(score >= t for t in thresholds)]

class Tracks:
    def __init__(self):
        self.items = {}
        self.unique = {}

    def update(self, track_id, kind, center, time, confidence, box, stationary_threshold):
        old = self.items.get(track_id)
        motion = 0.0
        stationary = 0.0
        if old and time > old["lastSeen"]:
            dt = time - old["lastSeen"]
            if dt < 2:
                motion = math.dist(center, old["center"]) / dt
                stationary = old["stationarySeconds"] + dt if motion < stationary_threshold else 0
        history = list(old.get("history", [])) if old else []
        history.append({"time":time,"center":list(center)})
        history = history[-60:]
        direction = [center[0]-old["center"][0],center[1]-old["center"][1]] if old else [0.,0.]
        acceleration = (motion-old["motionPxSec"])/(time-old["lastSeen"]) if old and time>old["lastSeen"] else 0.
        item = dict(history=history,direction=direction,accelerationPxSec2=acceleration,trackId=track_id, type=kind, center=list(center), motionPxSec=motion,
                    stationarySeconds=stationary, lastSeen=time, confidence=confidence, box=box,
                    timeVisible=(old["timeVisible"] + time-old["lastSeen"]) if old else 0)
        self.items[track_id] = item
        self.unique.setdefault(track_id, kind)
        return item

class TrafficSmoother:
    """Time-based EMA and persistence debounce independent of frame stride."""
    def __init__(self, seconds=2, persistence=1):
        self.seconds=seconds
        self.persistence=persistence
        self.score=None
        self.last_time=None
        self.state=None
        self.candidate=None
        self.candidate_since=0

    def update(self, raw, time, thresholds):
        dt=0 if self.last_time is None else max(0,time-self.last_time)
        self.score=raw if self.score is None else self.score+(1-math.exp(-dt/self.seconds))*(raw-self.score)
        self.last_time=time
        proposed=level(self.score,thresholds)
        if self.state is None: self.state=proposed
        if proposed!=self.candidate:
            self.candidate=proposed
            self.candidate_since=time
        if time-self.candidate_since>=self.persistence: self.state=proposed
        return self.score,self.state
