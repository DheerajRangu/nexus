# AEGIS OmniVision · Live Vision Engine

**Press Play. AI follows the road while it plays.**

Upload a video or connect a camera, then use Play, Pause, Seek and Stop. The canvas displays frames from the live inference pipeline with their matching object IDs, trajectories, road regions, lanes and road state. There is no separate Analyze button or wait for a processed MP4. The visual transcript, evidence packages and report grow during playback.

## Run locally

Python 3.12+ and Node.js 22+. On Windows, use `py -3.12` and `.venv\Scripts\Activate.ps1`.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m ai.prepare_models --download
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173**. Models are already prepared in this workspace; skip model preparation here. A clean checkout needs the public SegFormer, YOLO-World and CLIP downloads (roughly 450 MB). Compiled YOLO-World inference runs offline without loading CLIP. `requirements.lock.txt` records the installed Python packages.

Test with [highway-traffic.mp4](videos/samples/highway-traffic.mp4), a 29-second road video; attribution is in `videos/samples/SOURCE.md`. This is real footage, not prepopulated dashboard results.

## Live workflow

1. Upload MP4/MOV/AVI/MKV (up to 500 MB), choose a saved video, or connect the browser camera.
2. Press **Play**. First use initializes and warms the perception models before starting the source clock. Later sessions reuse the loaded models.
3. Frames appear with matching AI metadata. The single AI panel updates from the same packet as the canvas.
4. **Pause** stops frame advancement and inference. **Seek** starts a new local tracking segment at the requested timestamp; paused seeking analyzes one preview frame. **Stop** clears playback.
5. Switch **Minimal / Intelligence** overlays. Click transcript entries to seek; important event images open before/event/after evidence and original frames.
6. Reports, transcript and tracking/state histories are saved incrementally. At the end of playback the report is already available. Print / Save PDF opens a printable evidence report.

Camera access uses the browser's native permission prompt and requires localhost or HTTPS. Optional CCTV: set `AEGIS_CAMERA_SOURCE` to an operator-configured RTSP URL or server webcam index before starting FastAPI. The **Connect configured CCTV** setting appears when configured. Camera feeds do not seek. No arbitrary camera URL is accepted from the browser.

## Synchronization and performance

```text
Uploaded file / configured camera / browser camera
                     │
         paced decoder / incoming JPEG frames
                     │
          bounded latest-frame slot (capacity 1)
                     │
      scheduled detector + motion/appearance tracking
          road segmentation + object evidence
          flow + lanes + temporal Road Brain
                     │
      synchronized JPEG + metadata packet (same timestamp)
                     │
     bounded result slot + browser render acknowledgement
                     │
             React canvas + live AI panel
                     │
     visual transcript → evidence → incremental report
```

The source clock follows wall time while playing. The decoder discards old pending frames when inference is busy; it does not process an accumulating queue. Each transmitted packet includes `frameNumber`, `videoTimestamp`, `serverTimestamp`, `generation` and `segment`. Commands invalidate in-flight frames. The browser only renders current-generation results and acknowledges rendering before another result is sent. The result slot also retains only the newest pending packet.

**Frame rate is hardware-dependent.** The canvas displays analyzed frames, so slow hardware produces fewer displayed frames and jumps forward to current source time. It does not independently play a normal HTML video under stale overlays. The bounded queue prevents growing backlog; it cannot eliminate the time spent running one inference. Source-to-result latency may exceed the target during expensive model refreshes. No universal 30 FPS or 80 ms guarantee is claimed.

Settings select FAST (detect every 3 processed frames), SMART (every 2) or MAX (every processed frame). Tracking propagates between detections with velocity prediction and sparse Lucas-Kanade flow. Detection also refreshes after a 300 ms source-time gap. Segmentation refreshes every 2 source seconds, object evidence every 700 ms, lane geometry every 400 ms. Supported anomaly states increase detection frequency and segmentation cadence. The developer monitor shows source/inference/display FPS, inference/stream latency, dropped frames and device.

Live inference automatically selects CUDA, then Apple MPS, then CPU. `INFERENCE_DEVICE=cpu`, `mps`, `0` or `cuda:0` overrides selection. CUDA/TensorRT deployment and real RTSP hardware were not tested locally; TensorRT conversion and learned ReID are not integrated.

## Event intelligence and evidence

The visual transcript records material road-condition changes, persistent hazard/construction evidence, estimated lane changes, flow disruptions, isolated stops, potential vehicle interactions, density increases and access-score decreases. Entries use INFO / NOTICE / WARNING / CRITICAL. Repeated active evidence is deduplicated; an ongoing event maintains a bounded story of observed traffic/score changes and ends when its evidence disappears or a tracking segment ends.

Important events capture JPEGs from a bounded evidence window sampled at up to 5 Hz. Representative selection uses measured sharpness and object scores while preserving full-scene context. Evidence contains original and annotated before/event/after images, selection reasons, metadata and structured descriptions. After images only exist when that later context was observed; a seek or early disconnect can leave the window incomplete. Stationary-object context crops are provided where supported. These heuristics do not guarantee an unobstructed best view.

Major file-video events schedule an original-source H.264 clip, up to 5 seconds before and after the event, after playback has observed the later window. Encoding runs separately from live inference. Clips are unannotated; annotated evidence images and live replay are supplied separately. Browser/configured camera clip recording is not implemented. PDF export uses the browser's Print / Save PDF function rather than a server PDF renderer.

Artifacts are under `videos/sessions/<session-id>/`:

```text
report.json               current/final summary, findings, coverage and event memory
transcript.jsonl           initial transcript entries; current lifecycle is in report.json
tracks.jsonl               incremental sampled track observations
states.jsonl               incremental road states
 events/EVT-00001/
    before_raw.jpg / before_annotated.jpg
    event_raw.jpg / event_annotated.jpg
    after_raw.jpg / after_annotated.jpg
    context_crop.jpg       when a useful stationary-object crop exists
    metadata.json / description.json
    clip.mp4              for supported important file-video events
```

Manual seeks create new segments. Reports explicitly record sampled coverage and do not claim a complete history of skipped intervals. IDs such as `S02-VEH-0017` are local to a segment; they are not asserted to identify the same vehicle across a seek. Appearance association uses color histograms, not learned ReID embeddings, and can switch identities through occlusion.

## Perception and interpretation

| Module | Implementation | Interpretation |
| --- | --- | --- |
| Road | SegFormer-B0 trained on Cityscapes | Approximate road/sidewalk pixels; vehicle-covered road support included |
| Vehicles and people | YOLO26 + local velocity/optical-flow/appearance tracklets | IDs, trails, pixel motion, acceleration, stopping and estimated lane association |
| Construction/hazards | Compiled YOLOv8s-Worldv2 or optional custom YOLO | Experimental open-vocabulary observations, not validated specialist hazard detection |
| Evidence fusion | Duration, observations, majority persistence and road overlap | One cone or a single flash does not confirm construction |
| Road flow | Farneback with approximate background-translation correction | Relative motion and camera-motion checks, not calibrated km/h |
| Lanes | Persistent Hough painted-line geometry | Experimental lane regions only where markings support them |
| Behavior | Temporal Road Brain | Flow collapse, unusual stopping, direction anomalies and possible vehicle interactions |
| Explanation | Structured evidence and relationship graph | Observations separated from uncertain interpretations; no remote VLM dependency |
| Forecast | Recent-score linear extrapolation | Experimental 60-second traffic-score projection, not a congestion probability |
| Health/access | Explainable traffic/object/incident/lane penalties | Experimental visual scores, not ambulance clearance certification |

Traffic combines density (10%), occupancy (35%), stopping (30%) and low pixel motion (25%), with time-based smoothing/persistence. Freely moving high counts alone cannot produce severe congestion. GRIDLOCK requires prolonged dense stopping. Motion and acceleration remain uncalibrated pixel measurements. The UI displays NORMAL / SLOWING / STOPPED / ACCELERATING / DECELERATING states from those measurements; turning and merging intention are not established.

Possible incidents require converging overlap, abrupt movement loss and persistent stopping. They are never confirmed collisions, injury estimates or calibrated accident probabilities. Lane obstruction and wrong-way interpretations require estimated lane evidence and remain experimental. Construction association does not prove that construction caused congestion. Lack of detections does not certify a safe road.

Road-health and emergency-access scores remain **experimental**. Physical ambulance width, priority and passability are unresolved; `routingDecision` is `REQUIRES_VERIFICATION`. The Cityscapes model and open-vocabulary prompts can fail on unfamiliar geography, poor lighting/weather, aerial views, small objects and occlusion. No specialized hazard model was trained because no labeled dataset was supplied.

## API

Interactive docs: **http://localhost:8000/docs**.

- `POST /api/videos/upload`: multipart `file`; `GET /api/videos`: saved sources
- `GET /api/live/sources`: available camera adapters
- `POST /api/live/sessions`: `{ "videoId": "...", "mode": "FAST" }`; omit `videoId` for browser camera, or use `source: "configured"` for configured CCTV
- `WS /ws/vision/{sessionId}`: commands `play`, `pause`, `seek` with `timestamp`, `stop`, and `ack`; binary JPEGs for browser camera
- `GET /api/live/{sessionId}/report`: current report, available during playback
- `GET /api/live/{sessionId}/export/json|transcript|tracks|states`
- `GET /api/live/{sessionId}/events/{eventId}/{filename}`: evidence and supported clips
- `GET /api/live/{sessionId}/print`: printable report

A frame packet includes raw JPEG image data plus boxes, trajectories, road polygons, lanes, metrics, intelligence, events and timing. The browser draws overlays, avoiding a new encoded annotated MP4 in the playback path. Up to two open live sessions are admitted per API process; model execution is serialized and reusable, with independent track/road brains. Sessions close when their WebSocket disconnects. Saved reports remain on disk.

Legacy `/api/videos/{id}/analyze`, batch exports and `/ws/analysis/{id}` remain compatible for old integrations. The new UI does not invoke them. Live sessions run in FastAPI, independently of the optional Celery batch worker.

## Configuration, training and deployment

- `config/config.yaml`: detector/scoring/stopping/upload thresholds and legacy batch modes.
- `config/omnivision.yaml`: model paths, class prompts, persistence, construction/hazard weights and trend settings.
- `VEHICLE_MODEL`: alternate vehicle checkpoint.
- `CUSTOM_HAZARD_MODEL`: optional trained detector with matching semantic class names.
- `.env.example`: database/CORS/API key/device/configured-camera options. Pass environment variables to the process; the app does not automatically source `.env`.

After editing prompts, rerun `python -m ai.prepare_models` to compile text embeddings. Custom training uses the 20 class IDs in `config/classes.yaml` and [annotation guidance](docs/ANNOTATION.md):

```sh
python -m ai.training.extract_frames --video construction.mp4 --every 0.7 --output frames/construction
python -m ai.training.split_dataset --manifest frames/manifest.csv --output datasets/construction-v1
python -m ai.training.train_model --data datasets/construction-v1/data.yaml --model yolo26s.pt --device cpu
python -m ai.training.validate_model --model models/construction-v1/best.pt --data datasets/construction-v1/data.yaml
```

Prepare models locally, then use `docker compose up --build`; open http://localhost:8080. Nginx supports the live WebSocket, and the video/model volumes include live evidence. SQLite is the standalone default; Docker uses PostgreSQL/Redis and an optional legacy batch worker. Docker is unavailable on this host, so Compose/GPU-container execution remains untested. Live sessions are process-local: multi-worker deployment requires sticky WebSocket/session routing or a session service.

```sh
pytest
npm run build --prefix frontend
pip check
```

Keep this prototype on a trusted network. Internet deployment needs user authentication, quotas, retention, worker recovery and validated models. The optional `AEGIS_API_KEY` protects server clients; browser image/WebSocket requests need an authenticated reverse proxy because they do not supply custom key headers. RTSP credentials belong in server configuration, never frontend state. Filesystem evidence retention/cleanup is not automated.

Model references: [Ultralytics YOLO-World](https://docs.ultralytics.com/models/yolo-world/), [NVIDIA road checkpoint](https://huggingface.co/nvidia/segformer-b0-finetuned-cityscapes-1024-1024), [Ultralytics licensing](https://www.ultralytics.com/license).
