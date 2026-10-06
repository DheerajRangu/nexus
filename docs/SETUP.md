# Connected runtime setup

Requirements: Python 3.12+, Node 22+, local model assets; optional PostgreSQL or Docker. Run from repository root. Web workspace has one root lock: do not run npm ci inside frontend.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
npm ci
# Clean checkout only: prepare public vision model assets.
python -m ai.prepare_models --download
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In another terminal, from root:

```sh
npm run dev
```

Open http://localhost:5173/control-room. Other routes: /citizen, /driver, /hospital. Use separate browser profiles for roles, since each browser has one operational cookie. All endpoints proxy to the same backend. No Java/Express/Cloudflare service is needed for this connected runtime.

Environment: DATABASE_URL optional (local SQLite default); AEGIS_DEMO_MODE=true for seed/intake/demo role login; AEGIS_OPERATOR_KEY required outside demo; COOKIE_SECURE=true behind HTTPS; CORS_ORIGINS for trusted web origins; AEGIS_API_ORIGIN overrides Vite proxy destination; VITE_GOOGLE_MAPS_API_KEY in frontend/.env.local enables Google display; AEGIS_CAMERA_SOURCE optionally supplies operator-controlled RTSP/webcam. Browser key must be referrer restricted. POSTGRES_PASSWORD is used by Compose. Never commit .env or tokens. Demo mode must be limited to a trusted environment. Non-demo citizen account/admission and full per-user identity are deployment integrations.

```sh
# Unit/integration, TypeScript, lint and production web build
.venv/bin/pip install -r requirements-dev.txt
npm run test
npm run typecheck
npm run lint
npm run build
# Optional Docker stack: uses the existing Postgres/Redis choices.
docker compose up --build
```

Docker serves http://localhost:8080. Model/video volumes must be prepared. The legacy Celery worker handles existing offline exports; live vision and emergency orchestration run in FastAPI. Docker and physical PostgreSQL deployment need their own acceptance checks.

Native Expo citizen client:

```sh
cd mobile
npm ci
EXPO_PUBLIC_AEGIS_API_URL=http://YOUR_LAN_IP:8000 npm start
npm run typecheck
```

Use Demo roles → Citizen. Intake obtains and confirms foreground GPS before creating an incident. Permission denial directs the user to the web manual-pin flow. SSE and snapshot recovery use the same FastAPI authority. A device cannot use localhost to reach your computer. Native Google Maps keys and development builds remain platform-specific.

Flutter driver client:

```sh
cd driver-app
flutter pub get
flutter analyze
flutter run --dart-define=AEGIS_API_ORIGIN=http://YOUR_LAN_IP:8000 --dart-define=AEGIS_AMBULANCE_ID=AMB-07
```

Check native app permission/key setup in driver-app/README.md. Foreground GPS and SSE are wired; background execution, physical-device installs and external navigation providers require device validation. Native static checks do not imply device acceptance.

For isolated browser testing, start backend on 8001 with DATABASE_URL=sqlite:///./videos/outputs/integration-demo.db and CORS_ORIGINS=http://localhost:5180; start web with AEGIS_API_ORIGIN=http://127.0.0.1:8001 npm run dev -- --port 5180. Then run the browser command in DEMO_FLOW.md. Never point the seed test at production.
