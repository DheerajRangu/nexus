# PROGRESS

## Status
- A: GREEN (unchanged; not re-run this session)
- B: GREEN (unchanged; suite still includes AccessAndIntakeTest + DbIntegrityTest)
- C1: GREEN
  - Proving command: `.\mvnw.cmd -Dtest=DispatchC1Test test` -> Tests run: 4, Failures: 0, Errors: 0; BUILD SUCCESS; TEST_EXIT=0
  - Full suite at step end: `.\mvnw.cmd test` -> Tests run: 14, Failures: 0, Errors: 0; BUILD SUCCESS; SUITE_EXIT=0
  - Covered: 20 parallel accepts -> 1 ACCEPTED + 1 ASSIGNED (19 DomainConflictException); expired offer -> next ambulance + second expiry job no-op; no eligible -> ESCALATED + ESCALATION audit; stale ping / wrong capability filtered; SIMULATED routing reasons
  - Added: RoutingProvider + HaversineDemoRoutingProvider; atomic acceptIfStillOpen; Offer expiry job; DomainConflictException -> 409 problem+json; dispatch thresholds in application.yml
- C2: GREEN
  - Proving command: `.\mvnw.cmd -Dtest=HospitalC2Test test` -> Tests run: 6, Failures: 0, Errors: 0; BUILD SUCCESS; TEST_EXIT=0
  - Full suite at step end: `.\mvnw.cmd test` -> Tests run: 20, Failures: 0, Errors: 0; BUILD SUCCESS; SUITE_EXIT=0
  - Covered: 8 parallel reserves on 1 bed -> 1 winner + 7 DomainConflictException + reserved_beds CHECK; stale snapshot excluded from AVAILABLE + listed UNKNOWN; capability filter before rank; estimate = max(travel,resourceReady)+handover with assumptions; active roadblock -> routeAvailable=false + ROUTING_NO_ALTERNATIVE audit (no invented route); expired roadblock ignored; routes labeled SIMULATED
  - Added: Hospital.reservedBeds + reserveBedsIfAvailable; HospitalDecisionEngineService rewrite; RoadGraphProvider + DemoRoadGraphProvider (segment intersect); RoutingService (no alt -> alert); RouteVersion persist on ETA delta; HospitalC2Test
- C3: GREEN
  - Proving command (AI): `python -m pytest tests/test_ai_endpoints.py -q` -> 7 passed; PYTEST_EXIT=0
  - Proving command (Spring): `.\mvnw.cmd -Dtest=AiEventsC3Test test` -> Tests run: 4, Failures: 0, Errors: 0; BUILD SUCCESS; TEST_EXIT=0
  - Full suite at step end: `.\mvnw.cmd test` -> Tests run: 24, Failures: 0, Errors: 0; BUILD SUCCESS; SUITE_EXIT=0
  - Covered: training twice identical metrics + synthetic disclaimer; demand `insufficient data`; prompt-injection -> actionTaken=NONE / no forced cardiac; dead AI port -> aiStatus=FALLBACK + dispatch shortlist still works; outbox row after mission.assigned + publisher marks published; duplicate/older entityVersion dropped; /snapshot reconnect payload
  - Added: AI sanitize + demand stub; seed_generator mission-grouped split; AIServiceClient timeout/retry + FALLBACK; V4 outbox_events; OutboxService/PublisherJob; EventVersionGate; SnapshotService/Controller; docs/model-card.md, data-dictionary.md, PROVENANCE.md; AiEventsC3Test
- D1: GREEN
  - Proving command: `.\mvnw.cmd "-Dtest=DemoD1Test,DemoOutsideProfileTest" test` -> Tests run: 8, Failures: 0, Errors: 0; BUILD SUCCESS; TEST_EXIT=0
  - Full suite at step end: `.\mvnw.cmd test` -> Tests run: 32, Failures: 0, Errors: 0; BUILD SUCCESS; SUITE_EXIT=0
  - Covered: reset twice identical fingerprint; run-scenario -> COMPLETED + reservation CONSUMED; driverRejection -> next ambulance; fullHospital -> next hospital; competingAssignments -> 1 winner; aiDown -> FALLBACK; demo endpoints 404 without `demo` profile
  - Added: `@Profile("demo")` DemoControlsController (reset/run-scenario/inject); DemoResetService deterministic restore; DemoScenarioService real service-call pipeline + step delay; CONTRACT-aligned MissionStateMachine + consumeReservation; scripts/demo.ps1; DemoD1Test + DemoOutsideProfileTest
- D2–D3: superseded by E0–E4 finish prompt (frontend/docs path)
- E0: IN PROGRESS
- E1–E4: NOT STARTED

## Blockers
- none
