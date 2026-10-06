# Verification scope

## Completed local checks

- 33 pytest tests passed, including seven live-engine tests: latest-frame replacement, optical-flow/appearance identity association, play/pause/seek/stop synchronization, incremental reports, event snapshot provenance/deduplication, source-clock EOF/no-repeated-frame behavior and bounded camera input/pause handling and a decodable incident-clip export.
- TypeScript and Vite production build passed. Python dependency consistency passed.
- Real highway footage ran through YOLO26, SegFormer and compiled YOLO-World on Apple MPS in a headed browser. Two successful live runs each delivered 389 frame packets; the final run processed 399 frames, replaced 40 pending source frames and replaced 10 output packets. Pause/resume and a seek divided playback into two observed segments.
- Seeking to 18 seconds produced the requested source frame at 17.9846 seconds in segment 2; source frame number, displayed image and metadata were carried together.
- Cold model initialization preceded the source clock. After full-model warmup, first-packet inference measured 66.8–323.6 ms and the stream pipeline 126.6–377.3 ms across the two runs; the final propagated frames measured about 10 ms inference and 15.2–34.3 ms stream latency. These are specific observations, not universal FPS/latency guarantees or a statistically complete benchmark.
- Browser checks passed for upload, automatic live-session creation, Play, Pause, Seek, source end, Minimal/Intelligence modes, desktop/mobile layout without overflow, incremental report JSON and no JavaScript errors. Playback naturally ended and the report marked completion with sampled coverage.
- Synthetic important-event tests wrote original/annotated before/event/after evidence, metadata and descriptions. They verify storage/lifecycle behavior, not collision/hazard accuracy on road footage.
- The earlier batch regression processed the entire 29.4-second highway clip, produced 69 vehicle tracks and two decodable 882-frame H.264 outputs. Batch API compatibility remains; the live UI does not invoke it.

## Practical limits

Real webcam/RTSP hardware, CUDA/FP16/TensorRT, multi-process session routing and Docker/Compose remain untested locally. Docker is unavailable on this host. A browser camera source was exercised using valid/invalid synthetic JPEG frames through the actual WebSocket adapter.

The highway clip contains no verified major incident, so it does not validate event recall, false-alarm rate or the quality of real accident evidence. No custom hazard model was trained. The object labels, lane geometry, interaction rules, projections and access/health scores remain experimental.

## Accuracy validation required

Use unseen footage across cameras, lighting, weather and road geometry. Annotate road masks, object classes, IDs, lane topology and incident timestamps. Measure segmentation IoU, class precision/recall, ID switches, temporal false alarms, missed events and latency distributions under load. Include construction outside the road, isolated cones, moving cameras, occlusion and dense freely moving traffic as difficult negatives.

Software checks and one successful live stream do not establish physical ambulance clearance or safe emergency routing. Pixel motion is not physical speed; temporal construction association does not prove causality. Manual seeks and latest-frame dropping leave unobserved gaps explicitly recorded in the report.
