# Live Vision delivery status

The primary workflow is now upload/camera → Play → synchronized inference frames and AI metadata → incremental visual transcript, evidence and report. Pause freezes advancement, Stop stops it, and Seek begins a new local tracking segment. The old Analyze Everything workflow is removed from the UI; batch API compatibility remains.

Implemented live architecture: wall-clock-paced OpenCV file decoder, a one-frame latest-wins slot, scheduled YOLO corrections, velocity/appearance/sparse-flow tracklets between detector calls, road segmentation, road-object evidence, lane geometry and the temporal Road Brain. Each frame packet carries source/server timestamps, frame number, segment and generation. The React canvas renders that frame with its metadata; render acknowledgements and a bounded output slot provide backpressure. No independently playing HTML video or final MP4 encoding is required.

Implemented camera ingestion: browser webcam JPEGs through the same pipeline and an operator-configured OpenCV CCTV/RTSP adapter. Browser camera controls are covered with synthetic input tests. Actual webcam/RTSP hardware and CUDA deployment have not been validated on this host. Apple MPS is selected and exercised locally.

Implemented event intelligence: deduplicated material changes, severity, lifecycle/story updates, raw/annotated before/event/after JPEG evidence, representative-frame scoring, context crops, visual descriptions with uncertainty, incremental JSON/JSONL reports and source-video incident clips encoded outside live inference. Camera clip recording, learned ReID, TensorRT, a remote VLM and certified routing are not implemented. PDF uses the browser Print / Save PDF workflow.

Current tracking IDs are segment-local. Velocity and histogram association can fail through occlusion; skipped intervals do not imply continued identity. Road/access scores, open-vocabulary objects, lanes, incidents and projections remain experimental.

Remaining research: specialized validated hazard models, robust lane topology/physical calibration, accurate tracking through occlusion, calibrated temporal incident detection, learned forecasting, emergency-access outcome validation and camera-specific benchmarks.

Production hardening: session-service or sticky routing for multiple API processes, authentication, retention/quotas, camera reconnect/timeouts, storage lifecycle, observability, model registry and recovery. Docker configuration includes WebSocket proxying but was not run because Docker is unavailable locally.
