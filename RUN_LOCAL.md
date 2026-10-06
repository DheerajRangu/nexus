# Run the integrated AEGIS project

The active services are FastAPI and the React workspace. The Java standalone applications are preserved branch sources, not additional active mission authorities.

From this directory, in PowerShell (Python 3.12+, Node 22+ recommended):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm ci
npm run dev
```

Open http://localhost:5173/control-room. Use the command-room demo control to load the Hyderabad fleet. Citizen intake is `/citizen`; driver is `/driver`; hospital command is `/hospital`. Use separate browser profiles for roles. The server confirms assignments; driver acknowledgement is not acceptance.

```powershell
npm test
npm run build
docker compose config
```

Docker is optional for local SQLite mode. Start Docker Desktop before `docker compose up --build` if you want PostgreSQL/Redis. Flutter requires a separately installed SDK: `cd driver-app`, then `flutter pub get`, `flutter analyze`, and `flutter run` with the API origin for your device.

Source ZIPs deliberately exclude `.venv`, `node_modules`, credentials, database state, build output, and downloadable vision model weights. Install dependencies after extraction. Actual camera inference needs the documented `python -m ai.prepare_models --download` step; simulated camera events need no model weights. See INTEGRATION_REPORT.md for remaining integration boundaries.
