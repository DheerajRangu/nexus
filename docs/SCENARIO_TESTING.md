# Testing different road scenarios

Open http://localhost:5173, refresh once, click **Videos**, choose a scenario and press **Play**. Start with FAST so latency and frame dropping are easy to assess. Switch the transcript to **All** to see routine condition changes. **Details** opens confidence, camera-motion caveats and score explanations; the main panel remains compact.

The clips are also available in `videos/samples/` for manual upload. These are test inputs, not annotated ground truth or guaranteed model outcomes.

| Scenario | File | Length | What to check |
| --- | --- | --- | --- |
| Free-flow baseline (real) | `highway-traffic.mp4` | 29.4 s | Vehicle IDs/trails follow the source; freely moving vehicles do not become severe traffic solely because of count. |
| Busy urban mixed traffic (real) | `scenario-city-traffic.mp4` | 11.1 s | Buses, trucks, motorcycles and pedestrians; occlusion and ID switches; occupancy/stopping rather than count alone; portrait video framing. |
| Road construction (real) | `scenario-construction.mp4` | 16.3 s | Workers, barriers and equipment; experimental object labels; road-region quality from an aerial view; sustained supported evidence before construction findings. |
| Road blockage (real) | `scenario-road-block.mp4` | 10.5 s | Concrete barricades and ROAD CLOSED signs obstruct the road. Check persistent barrier/obstruction evidence; zero vehicles must not imply accessibility. |
| Accident aftermath (real) | `scenario-accident-aftermath.mp4` | 21.3 s | A damaged stationary car. Check detection and obstruction evidence; do not claim the time or occurrence of an impact without its temporal lead-in. |
| Rainy night (real) | `scenario-rainy-night.mp4` | 42.3 s | Missed/false vehicle detections, glare/reflections, road-mask uncertainty and tracking loss. Rain is not proof of flooding or impassability. |
| Frozen flow and recovery (synthetic) | `fixture-stop-and-resume.mp4` | 20.0 s | 0–5 s moving footage, 5–15 s repeated frame, 15–20 s resumed footage. Measured motion should decline during the hold and recover afterward. Stationary cars alone must not establish a collision. |
| Camera shake (synthetic) | `fixture-camera-shake.mp4` | 12.0 s | Background movement, biased pixel speeds and camera-motion notes in Details. Camera motion should not automatically become a road incident. |

Do not expect every construction object or pedestrian to be recognized; use these clips to discover failure cases. No collision/hazard recall has been validated on this pack. Some road masks or lane estimates may be unreliable, especially the aerial construction and portrait scene. The frozen fixture holds the entire image, so it tests a controlled visual-flow change rather than a physical traffic queue.

## Controls to test on each clip

1. Play for several seconds, then Pause. Image, counters and source timestamp must stop advancing.
2. Seek forward while paused. One preview should be analyzed near the requested time with a new segment ID.
3. Resume. The stream should advance from the sought point, without queued old images.
4. Open Details during playback. The assessment stays frozen while you read it; close to return to live measurements.
5. Stop. Playback and processing should stop.
6. Replay with SMART/MAX if desired. Compare device/latency/dropped frames through the developer monitor; higher compute can reduce displayed frame rate.

Seeking over an event skips its temporal lead-in. To assess persistence/incident reasoning, play continuously through the period of interest instead of jumping to its end.

## Record findings

For each run record scenario, mode, timestamp, observed behavior, expected behavior and an evidence screenshot/report. Useful defects include a phantom collision, false construction from a single cone, repeated transcript entries, unstable lane counts, an ID switch, a missed pedestrian, a road mask including sidewalks, or a layout jump while counters update.

The pack's MP4 frame counts and decoding were verified. This is a set of controlled inputs for manual testing, not a model-accuracy benchmark. Sources and derivative edits are documented in [SOURCE.md](../videos/samples/SOURCE.md).

## Initial browser smoke check

All three downloaded real clips were selected from Videos, started in FAST mode and paused after roughly one second of displayed observations, with no JavaScript errors. The portrait urban clip streamed at 720 × 1280; construction/night at 1280 × 720. This confirms ingestion and playback, not scenario classification accuracy.

At those short checkpoints the engine tracked 9 urban vehicles, 1 vehicle in the construction view and 0 vehicles in the rainy-night view. The rainy-night image shows distant headlights, so the zero count is a useful example of a low-light detection limitation. Its FREE FLOW label must not be interpreted as proof that the road is empty or safe. Construction persistence needs a longer continuous run than this smoke check.

## Construction, road-blockage and accident-aftermath run

Each clip played continuously from its start through at least eight source seconds in FAST mode, then paused. All three streamed without browser JavaScript errors. The full MP4s also decoded successfully. These checkpoints test the first eight seconds, not the entire footage or detection recall.

| Scene | Observed model output at checkpoint | Finding |
| --- | --- | --- |
| Construction, 8.125 s | LIGHT OBSERVED; no construction finding, no hazards; 0 tracked vehicles | Missed construction evidence in this aerial view. |
| Barricaded road, 8.067 s | FREE FLOW OBSERVED; no hazards; 0 tracked vehicles; access score 100 | False-clear interpretation: visible barriers close the road. Empty vehicle detections do not establish passability. |
| Wrecked-car aftermath, 8.408 s | LIGHT OBSERVED; 4 tracked vehicles; no hazards or suspected incident | Damaged vehicle/aftermath was not flagged. Lack of an impact event is not itself a failure because this clip does not show the collision. |

These initial failures were addressed by the update below. Playback works, but the current experimental object detector and road reasoning do not reliably identify these scenes. Do not use the access scores as verified clearance. A separate clip containing pre-impact trajectories, impact and post-impact stopping is still needed to test the temporal collision rule.

Machine-readable checkpoints: [targeted-test-results.json](../videos/samples/targeted-test-results.json). Source attribution: [SOURCE.md](../videos/samples/SOURCE.md).

## Updated scene detection and reports

The pipeline now compares construction, barricaded closure and accident aftermath against normal traffic, intact parked cars, city traffic and rainy-night scenes using a local CLIP verifier. Scene evidence requires repeated observations over two seconds, and established findings tolerate brief weak matches. Object inference now uses 640-pixel inputs. Scene findings do not invent object boxes or lane IDs.

Final continuous FAST runs through eight seconds detected construction, road blockage and accident aftermath in their respective clips. Each transcript contained the initial road observation and one specific finding. Urban and rainy-night controls generated no incident alerts. All printable pages loaded evidence images without browser errors.

PDF summaries retain earlier incidents even after the current scene changes, and include timestamps, actions and captured evidence. Generic model-limitations sections are removed from the product report. Transcript exports include updated stories and evidence. Accident aftermath remains distinct from a recorded collision impact.

Verification: 38 Python tests passed; frontend production build passed. Detailed checkpoints: [improved-test-results.json](../videos/samples/improved-test-results.json). Example PDFs are saved in `videos/outputs/road-reports/`.
