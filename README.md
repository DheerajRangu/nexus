# AEGIS Control Room & Shared Operational Backend

> AEGIS (Automated Emergency Grid System) is the authoritative, multi-service operational backend and control-room platform connecting 108 Call Intake, Citizen Web Tracking, Ambulance Driver Mobile Apps, and Hospital ER Portals into a unified real-time emergency response network.

---

## 🏗️ Architecture & Component Overview

```
                                  ┌────────────────────────┐
                                  │ Citizen Web Tracking   │
                                  │ (/track/{token})       │
                                  └───────────┬────────────┘
                                              │ Secure Token URL
                                              ▼
┌──────────────────────┐  HMAC Sig  ┌────────────────────────┐  WS / STOMP  ┌────────────────────────┐
│ 108 Call Intake      ├───────────►│ Spring Boot Backend    ├─────────────►│ Control Room Dashboard │
│ Webhook & Manual     │            │ (Authoritative Core)   │              │ (React + Vite + Maps)  │
└──────────────────────┘            └───────────┬────────────┘              └────────────────────────┘
                                                │ REST / Advisory
                                                ▼
┌──────────────────────┐            ┌────────────────────────┐              ┌────────────────────────┐
│ Driver App           │◄───────────┤ FastAPI AI Service     │              │ Hospital ER Portal     │
│ (Offer Accept / GPS) │            │ (NLP / ETA / Demand)   │              │ (Bed Reservation)      │
└──────────────────────┘            └────────────────────────┘              └────────────────────────┘
```

1. **Authoritative Core**: **Spring Boot 3 (Java 21)** owns all database state, mission progress state machines, dispatch offer 30-second TTL expirations, atomic bed reservations, and PostGIS spatial queries.
2. **AI/ML Microservice**: **FastAPI (Python 3.11)** acts strictly as a non-mutating advisory engine providing NLP call note structuring, scikit-learn traffic-corrected ETA predictions, demand forecasting, and structured rationale explanations. Spring Boot falls back to deterministic rule-based algorithms if FastAPI is unreachable.
3. **Control Room Website**: **React, TypeScript, Vite, Tailwind CSS, Leaflet** with dark navy, teal, and emerald theme styling, featuring interactive city maps, call intake queues, candidate shortlist comparisons, 3-junction traffic corridor simulators, and live telemetry freshness indicators.
4. **Shared Operational Frontend Views**:
   - **Control Room Dashboard**: Central supervisor & call operator map-centered view.
   - **Citizen Location Tracking**: Scoped public tracking portal (`/track/:token`).
   - **Ambulance Driver View**: Mobile view simulating the Flutter Driver App (`/driver`).
   - **Hospital ER Portal**: Clinician capacity & atomic reservation confirmation view (`/hospital`).

---

## 📄 OpenAPI Specifications & Life Cycle Contracts

- **Mission Lifecycle Contracts & State Machines**: [`docs/mission-lifecycle-contracts.md`](file:///c:/Users/LENOVO/OneDrive/Documents/aegis-controlroom/docs/mission-lifecycle-contracts.md)
- **Role & Permission Matrix**: [`docs/role-permission-matrix.md`](file:///c:/Users/LENOVO/OneDrive/Documents/aegis-controlroom/docs/role-permission-matrix.md)
- **AI/ML Model Cards & Evaluation**: [`docs/model-cards.md`](file:///c:/Users/LENOVO/OneDrive/Documents/aegis-controlroom/docs/model-cards.md)
- **Spring Boot Backend OpenAPI 3.0**: [`docs/openapi-backend.yaml`](file:///c:/Users/LENOVO/OneDrive/Documents/aegis-controlroom/docs/openapi-backend.yaml)
- **FastAPI AI Microservice OpenAPI 3.0**: [`docs/openapi-ai.yaml`](file:///c:/Users/LENOVO/OneDrive/Documents/aegis-controlroom/docs/openapi-ai.yaml)

---

## PostgreSQL 16 + PostGIS on Windows (no Docker)

Docker is optional. Without it, the backend uses the Spring profile `local-pg` (`DB_URL`, `DB_USER`, `DB_PASSWORD`). Redis stays off unless `AEGIS_REDIS_ENABLED=true`. There is no H2 profile.

1. Install JDK 21 (full JDK, not a JRE) and set `JAVA_HOME` to that JDK. `javac -version` must print a 21 release.
2. Install PostgreSQL 16 from the EDB installer: https://www.postgresql.org/download/windows/ (winget id `PostgreSQL.PostgreSQL.16`). Remember the superuser password; do not put it in git.
3. Install the PostGIS bundle that matches PostgreSQL 16 from https://postgis.net/windows_downloads/ (Stack Builder, shipped with the EDB installer, can install it). Enable the extension in the new database.
4. Create the role and database in `psql` as the postgres superuser (replace the password locally; do not commit it):

```sql
CREATE ROLE aegis LOGIN PASSWORD 'set-this-locally';
CREATE DATABASE aegis OWNER aegis;
CREATE ROLE aegis_app LOGIN PASSWORD 'set-this-locally';
GRANT CONNECT ON DATABASE aegis TO aegis_app;
\c aegis
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE ON SCHEMA public TO aegis_app;
```

5. Copy `.env.example` to `.env` and set `DB_URL=jdbc:postgresql://localhost:5432/aegis`, `DB_USER=aegis_app`, `DB_PASSWORD`, `POSTGRES_PASSWORD`, `JWT_SECRET`, and `WEBHOOK_HMAC_SECRET`. The application connects as `aegis_app`, not as the postgres superuser.

To use real, traffic-aware routes, enable **Routes API** and billing in Google Cloud, restrict a server-side API key to Routes API, then set `GOOGLE_MAPS_API_KEY` in the gitignored `.env` and change `AEGIS_ROUTING_PROVIDER=google`. The backend calls Google; the key is not sent to the browser. If the key is absent or the provider is left as `demo`, the app continues using the labelled simulated route provider.
6. Confirm the database answers:

```powershell
$env:PGPASSWORD = "<DB_PASSWORD from .env>"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U aegis_app -d aegis -c "SELECT current_user; SELECT postgis_full_version();"
```

## How to start (Windows live demo)

Python for the AI service is **3.11** (`ai-service/Dockerfile` uses `python:3.11-slim`). Prefer `ai-service\venv` after `pip install -r requirements.txt`.

Routing, SMS, 108 webhooks, hospital census, and ML metrics are **SIMULATED / pipeline demo only**.

### 1) Database check (`aegis` = live demo DB)

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#][^=]+)=(.*)$' -and -not [string]::IsNullOrWhiteSpace($Matches[2])) { Set-Item -Path "Env:$($Matches[1].Trim())" -Value $Matches[2] } }
$env:PGPASSWORD = $env:DB_PASSWORD
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U aegis_app -d aegis -c "SELECT current_user, current_database(); SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1;"
```

### 2) AI service

```powershell
cd ai-service
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
# prove: GET http://127.0.0.1:8000/health
```

### 3) Backend (`local-pg,demo`)

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#][^=]+)=(.*)$' -and -not [string]::IsNullOrWhiteSpace($Matches[2])) { Set-Item -Path "Env:$($Matches[1].Trim())" -Value $Matches[2] } }
$env:SPRING_PROFILES_ACTIVE = "local-pg,demo"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
cd backend
.\mvnw.cmd spring-boot:run
# prove: GET http://localhost:8080/api/v1/health  (Flyway rank + seedUsers)
```

### 4) Frontend (optional for E0)

```powershell
cd frontend
npm install
npm run dev
# http://localhost:5173
```

### 5) Demo script

```powershell
cd <repo-root>
.\scripts\demo.ps1
# expect missionState=COMPLETED reservationStatus=CONSUMED
```

### DEMO ONLY users

Applied at runtime by `DemoUserSeeder` when Spring profile `demo` is active (not treated as production credentials from Flyway). Password for all: `password`.

| Username | Role | Scope |
|---|---|---|
| supervisor1 | ROLE_SUPERVISOR | city-wide |
| operator1 | ROLE_OPERATOR | city-wide |
| driver1 | ROLE_DRIVER | AMB-108-NORTH-01 |
| driver2 | ROLE_DRIVER | AMB-108-CENTRAL-02 |
| hospadmin1 | ROLE_HOSPITAL_STAFF | HOSP-CITY-GENERAL-01 |

## Other local options

### Frontend only
```powershell
cd frontend ; npm install ; npm run dev
```

### AI only
```powershell
cd ai-service ; .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Docker Compose (optional)
```powershell
docker-compose up --build
```

---

## 🧪 Operational Scenarios & Test Suite

- **108 Call Intake & Webhook Signature**: HMAC-SHA256 signature verification & idempotency header tracking (`X-Idempotency-Key`).
- **Dispatch Engine 30s Offer Expiry**: 30-second TTL offer countdown; automatic re-queueing on decline/expiry.
- **Concurrent Atomic Reservation**: Pessimistic database locking preventing duplicate ambulance assignment & last-bed reservation races.
- **Transparent Hospital Estimate**: Calculated via `max(travel_eta, resource_ready_delay) + handover_delay`.
- **Green Corridor Extension**: 3-junction traffic signal state machine (`REQUESTED` → `ACKNOWLEDGED` → `CLEARING` → `ACTIVE` → `PASSED` → `EXPIRED`).
- **SMS Outbox Log**: Outbox pattern with simulated delivery failure alerts for invalid carrier numbers (`+91-9000...`).
- **Deterministic System Reset**: Trigger instant reset to clean seed baseline via header controls.
