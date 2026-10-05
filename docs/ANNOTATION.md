# Road intelligence annotation guide

Use the exact 20 class IDs in `config/classes.yaml`. Draw a tight box around the visible object, not surrounding empty road. Annotate partially occluded objects when their identity is defensible; avoid guessing a fully hidden object. Use consistent definitions across annotators and audit ambiguous examples together.

- `construction_worker`: visible worker plus recognizable work-site context/PPE. A generic pedestrian is not automatically a worker.
- `crashed_vehicle`: visible collision damage or unmistakable crash context. Ordinary stationary traffic is not a crash.
- `broken_vehicle`: visible breakdown evidence. A stopped car alone is insufficient.
- `water_logging`: visible accumulated standing water on roadway. Reflections/wet asphalt alone are insufficient.
- `road_block`: substantial object obstructing travel; use more specific debris/barrier/tree classes when they apply.
- `road_digging`: visible excavation area; `damaged_road`: broken/degraded surface; `pothole`: localized hole.
- `emergency_vehicle`: recognizable emergency vehicle; do not infer priority/active response without separate evidence.

Include manually reviewed negative images: empty roads, normal roads, busy roads without construction, parking lots, ordinary signs, traffic-light queues and heavy congestion without incidents. Supply explicit empty label files for negatives. Never turn unreviewed missing labels into negatives.

YOLO row format: `class_id center_x center_y width height`, coordinates normalized by image width/height. One row per object. Keep related camera/location/video/scene frames in one source group. Avoid splitting neighboring frames across partitions. Test against unfamiliar cameras, weather, darkness, glare and partial occlusion. Track class distribution; prioritize recall and false positives for critical classes. Retain source rights and minimize personally identifying data.
