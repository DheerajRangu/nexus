# AEGIS integration report

## Branch audit and integration

This branch, `aegis-complete-integration-test`, was created from `origin/main` at `5ccb3a8` and fast-forwarded to the prior shared integration foundation `dc1db06`. No existing branch, including `main`, was changed.

| Source branch | Decision | Integrated result |
| --- | --- | --- |
| `main` | Integration base | Repository baseline and control-room base. |
| `aegis-controlroom` | Same tip as `main` | No unique commit to duplicate. |
| `aegis-initial-dispatch-module` | Already semantically consolidated by the foundation | Retains the Spring reference module, Flutter client, capability rankings, telemetry, contracts, and direct assignment workflow. |
| `aegis-patient-tracking-v1` | Applied unique post-foundation commit `3274429` | Demo-location notice, WhatsApp configuration, translations, and test coverage. |
| `aegis-road-intelligence` | Already semantically consolidated by the foundation | Shared road events, camera evidence, route updates, and command-room canvas. |
| `hospital-control-room-apps` | Consolidated into the shared authority; not merged as competing applications | Shared FastAPI hospital capacity, ranking, reservation, accept/divert, and handover flow remain the active implementation. |
| `aegis-full-system-integration` | Fast-forwarded as the shared foundation | One FastAPI/SQLAlchemy authority, React interfaces, native projections, Compose stack, and preserved reference sources. |

The old dispatch, road, and patient histories have unrelated roots. Their useful work had already been ported by `aegis-full-system-integration`; creating parallel backends from those trees would violate the one-authority architecture.

## Consolidation decisions

- FastAPI and SQLAlchemy are the active mission authority. The Java/PostGIS, Express, and Cloudflare sources remain preserved references and are not started with the connected stack.
- The active driver workflow now uses backend-confirmed assignment. The backend selects an eligible ambulance, creates its route, and marks it en route atomically. Driver `receipt` and `acknowledgement` are audit facts only; `accept` and `reject` are unavailable.
- The hospital branch’s capacity and handover behavior is represented by the active shared hospital endpoints and React workspace. Its standalone backends were deliberately not brought up beside the shared state store.
- A final vision report is persisted before the WebSocket publishes `ended`, preventing a Windows file-lock race at the report endpoint.

## Verification

| Check | Result |
| --- | --- |
| Python 3.12 isolated environment and `pip check` | Passed |
| Direct assignment + driver acknowledgement + hospital workflow tests | 9 passed |
| Vision completion race regression + connected workflow tests | 10 passed |
| Spring Boot reference module | `mvn test`: 3 passed; `mvn package`: passed |
| React TypeScript check | Passed |
| React Vite production build | Passed |
| Full Python suite | 47 passed in 22.29s (one non-failing FastAPI deprecation warning; Windows also reports a temporary SQLite cleanup warning after process exit) |
| Docker Compose / Postgres | Not run: Docker Desktop daemon is not running |
| Flutter | Not run: Flutter SDK is not installed |

## Local start and demo

Use Python 3.12 and Node 22+ where available. From the repository root:

```powershell
$env:YOLO_CONFIG_DIR = "$PWD\.tools\ultralytics"
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
# In another terminal
npm run dev
```

Open `/control-room`, seed the demo, then use `/citizen`, `/driver`, and `/hospital` in separate browser profiles. The deterministic flow is citizen pickup → capability filtering → backend-confirmed assignment → driver receipt/acknowledgement → telemetry → pickup → hospital selection/acceptance → routing/road event updates → handover.

## Known environment blockers

- Docker CLI and Compose are installed, but the daemon pipe is unavailable. Start Docker Desktop before `docker compose up --build`.
- Node 20.19.6 is installed; the repository documents Node 22+. WinGet could not replace it because its files are held by the current Node process (`0x80070020`).
- Flutter SDK is not installed, so Flutter analysis/test/device checks are pending.
- Google Maps, physical GPS, FCM, live traffic, real hospital systems, RTSP cameras, and physical signal controllers are not configured. The verified workflow uses existing local/deterministic simulation and local sample video only.
