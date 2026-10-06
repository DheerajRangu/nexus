# One connected emergency demo

Start services using SETUP.md. Open separate browser profiles (cookies differ by role):

1. `/control-room`: Open workspace, Seed demo network. Three ambulances and three hospitals appear from the backend.
2. `/citizen`: Enter patient and category, share phone location or confirm a manual pin, confirm patient pickup. A durable incident is created and dispatched.
3. Command room sees the same incident. HIGH trauma selects ALS AMB-07; nearer BLS AMB-01 is excluded with a reason.
4. `/driver`: Select AMB-07. The confirmed mission and pickup route are already delivered; record receipt/acknowledgement, then share device GPS or use Move ambulance · demo. All role views consume the same GPS.
5. Driver marks Arrived at patient then Patient picked up. Confirm severity/vitals when relevant. Hospital ranking rejects nearby incapable City General and reserves a suitable hospital.
6. `/hospital`: Select the assigned hospital and Accept incoming patient. The route and simulated green corridor activate.
7. Command room → AI Camera → Register camera on active route. This associates the test footage with a known location for the demo, not a location inferred from footage.
8. Upload `videos/samples/scenario-accident-aftermath.mp4` (or select the registered TEST clip), then Play. A persistent aftermath finding creates an evidence image and located road event; the intersecting ambulance route, ETA and corridor update in all views. Construction and road blockage clips can be tested through the same workflow. Operator Inject road event uses that same road API.
9. To test diversion, hospital → Hospitals → set ICU beds to 0 → Save. The backend chooses another capable hospital; sign into that hospital and accept. The previous corridor waits for new acceptance.
10. Driver marks Arrived at hospital; receiving hospital confirms Patient handover. All views show completion; vehicle and corridor priority release. Reload citizen tracking to verify recovery.

Driver receipt and acknowledgement do not accept, decline, cancel or reassign a mission. A missing acknowledgement creates a visible overdue event for the control room. Unrelated road events do not reroute a journey. A closure with no accessible alternative enters ROAD_BLOCKED; clearing evidence reevaluates routes. EN/TE/HI and trusted-link sharing use the preserved citizen experience.

Automated browser flow: `AEGIS_TEST_URL=http://localhost:5180 node tests/connected-flow.cjs`. Use an isolated demo DB with no active incident and prepared local vision models. It uploads the local accident clip when absent. Output/screenshots: `/tmp/aegis-connected-flow`. Actual footage and GPS/camera pin locations are explicitly demo inputs. No real ambulance, hospital or signal controller is contacted.
