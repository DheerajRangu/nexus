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
\c aegis
CREATE EXTENSION IF NOT EXISTS postgis;
```

5. Copy `.env.example` to `.env` and set `DB_URL=jdbc:postgresql://localhost:5432/aegis`, `DB_USER=aegis`, `DB_PASSWORD`, `POSTGRES_PASSWORD`, `JWT_SECRET`, and `WEBHOOK_HMAC_SECRET`.
6. Confirm the database answers:

```powershell
$env:PGPASSWORD = "<DB_PASSWORD from .env>"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U aegis -d aegis -c "SELECT version(); SELECT PostGIS_Version();"
```

## Quick start (Windows)

Python for the AI service is **3.11**, matching `ai-service/Dockerfile` (`python:3.11-slim`). On this machine use `py -3.11` if the `python` command is the Microsoft Store alias.

## ⚡ Quick Start & Local Execution (Windows Friendly)

### Option A: Local Frontend Execution (Node.js)
```powershell
# 1. Change to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```
Open `http://localhost:5173` in your browser. The application includes a full offline simulation adapter with mock data when backend services are not running.

### Option B: Python FastAPI AI Service
```powershell
# 1. Change to ai-service directory
cd ai-service

# 2. Install dependencies
pip install -r requirements.txt

# 3. Train ML Model & generate seed stats
python app/data/seed_generator.py

# 4. Start FastAPI server
uvicorn main:app --reload --port 8000
```
Open `http://localhost:8000/docs` for interactive Swagger UI.

### Option C: Docker Compose Full Stack Infrastructure
```powershell
# Launch Postgres, Redis, Spring Boot, FastAPI, and Vite Frontend simultaneously
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
