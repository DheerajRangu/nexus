# AEGIS — Initial Ambulance Dispatch Module

AEGIS is an emergency ambulance dispatch module that handles the workflow from an authorized emergency pickup request to assigning the correct ambulance and delivering the patient pickup location to the assigned driver.

This module is designed as the first part of a larger emergency-response system. Other team members can continue development from this point.

## Module Scope

The current implementation covers:

**Emergency / patient pickup input**

→ **Nearby ambulances displayed**

→ **Ambulance capability and availability checked**

→ **Suitable ambulance selected**

→ **Backend confirms the ambulance assignment**

→ **Assignment delivered to the corresponding driver**

→ **Exact patient pickup location delivered to the driver app**

→ **Navigation handoff toward the patient**

→ **Live ambulance telemetry and smooth moving vehicle visualization**

The module intentionally stops before hospital-side emergency processing.

---

## Main Features

### Live Ambulance Map

The control room displays nearby ambulances on a map.

Ambulance locations are updated using telemetry data.

Vehicle markers use timestamp-aware interpolation so movement appears smooth instead of jumping directly between GPS observations.

Reduced-motion preferences are also respected.

---

### Capability-Based Ambulance Selection

Ambulances are not selected based only on distance.

The system considers factors such as:

- ambulance availability
- ambulance status
- crew readiness
- equipment availability
- required medical capability
- stale location data
- active assignments

A closer ambulance can therefore be rejected if it is not suitable for the emergency.

The control room also shows reasons why an ambulance is eligible or ineligible.

---

### Direct Backend-Confirmed Assignment

Ambulance assignment is controlled by the Spring Boot backend.

The driver does not receive an ambulance job as an offer.

There is no **Accept / Decline** workflow.

Once the backend successfully confirms the dispatch, the assignment is considered active.

The control room must receive a successful backend response before showing the ambulance as assigned.

The backend also includes protection against:

- duplicate assignments
- conflicting active assignments
- repeated dispatch requests
- stale entity versions

Idempotency keys are used so retrying the same dispatch request does not accidentally create another active assignment.

---

## Driver App

A Flutter driver application is included under:

`driver-app/`

The driver-side integration supports:

- receiving the confirmed ambulance assignment
- viewing the patient pickup information
- receiving the exact pickup coordinates
- map/navigation handoff
- acknowledging that the assignment was received
- foreground ambulance location telemetry
- driver movement updates
- arrival state support

Driver acknowledgement is **not an Accept button**.

The ambulance has already been assigned by the backend before the driver receives it.

---

## Patient Pickup Location

The assigned driver receives the patient's exact pickup location through the backend.

The pickup information can be displayed on the driver-side map and used for navigation.

If the pickup location is corrected after assignment, the backend versions the change and supports notifying the assigned driver of the updated pickup information.

---

## Control Room

The control-room application is built using:

- React
- TypeScript
- Vite
- Tailwind CSS

It provides:

- map-centered dispatch interface
- nearby ambulance visualization
- eligibility information
- recommended ambulance selection
- direct ambulance dispatch
- assignment status
- pickup correction
- telemetry visualization
- smooth moving ambulance animation
- controlled failure/demo scenarios

The control room can run using either:

- the Spring Boot API, or
- the local deterministic simulation adapter

---

## Backend

The backend is built using:

- Spring Boot 3.5
- Java 21
- PostgreSQL
- PostGIS
- Flyway

The backend is authoritative for ambulance assignment and dispatch state.

Implemented backend functionality includes:

- ambulance candidate evaluation
- capability filtering
- direct transactional dispatch
- active-assignment constraints
- entity version validation
- idempotency
- telemetry validation
- driver assignment APIs
- driver acknowledgement
- pickup correction
- audit records
- durable outbox events
- database integrity constraints
- API contracts
- event contracts

---

## Database

PostgreSQL with PostGIS is used for the dispatch data.

Flyway migrations are included for database initialization.

The project also contains deterministic fictional seed data for local testing and demonstration.

---

## Integration Contracts

The integration contracts are available in:

`contracts/`

Important files include:

- `contracts/openapi.v1.yaml`
- `contracts/events.v1.json`

These define the API and event structures that other modules can use when integrating with this dispatch module.

---

## Project Structure

```text
aegis/
│
├── backend/
│   └── Spring Boot dispatch backend
│
├── control-room/
│   └── React control-room application
│
├── driver-app/
│   └── Flutter driver integration
│
├── contracts/
│   ├── openapi.v1.yaml
│   └── events.v1.json
│
├── docs/
│   ├── DRIVER-INTEGRATION.md
│   └── OPERATIONS.md
│
├── scripts/
│   └── Demo/testing scripts
│
├── docker-compose.yml
├── .env.example
├── README.md
└── HANDOFF.md
```

---

# Quick Start — Control Room Demo

Requirements:

- Node.js 20+
- Node.js 22 recommended

From the project directory:

```bash
cd control-room
npm install
npm run dev
```

Open the URL shown by Vite.

Without backend API environment variables, the control room uses the local deterministic simulation mode.

The demo includes different ambulance conditions such as:

- suitable ambulance
- closer but unsuitable ambulance
- busy ambulance
- stale telemetry
- off-duty vehicle
- equipment-unready vehicle

This allows the ambulance-selection and moving-map experience to be demonstrated without external services.

---

# Full Local Stack

Requirements:

- Docker Desktop
- Docker Compose
- Java 21
- Node.js
- PostgreSQL/PostGIS through Docker

From the AEGIS project directory:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Default services:

- Control room: `http://localhost:5173`
- Backend: `http://localhost:8080`
- PostgreSQL/PostGIS: port `5432`

Environment variables should be configured using the provided `.env.example` files.

Do not commit real passwords, API keys, or credentials.

---

# Control Room Testing

From:

`control-room/`

Run:

```bash
npm install
npm run build
npm test -- --maxWorkers=1 --minWorkers=1
```

The telemetry interpolation tests verify smooth movement between timestamped observations.

---

# Backend Testing

From:

`backend/`

Run:

```bash
mvn test
```

The backend tests currently cover ambulance eligibility logic and capability-based ambulance filtering.

The Spring Boot application can also be packaged using Maven.

---

# Driver App Setup

The Flutter driver application is located in:

`driver-app/`

With Flutter installed:

```bash
cd driver-app
flutter pub get
flutter analyze
flutter test
flutter run
```

The backend URL must be configured so the Android device or emulator can reach the Spring Boot server.

For Android emulators, the host machine is commonly reachable using:

`10.0.2.2`

For a physical Android device, use the development machine's local network IP.

Do not hardcode development-machine addresses in production configuration.

---

# Current Validation

The following validation has already been completed:

- frontend TypeScript validation
- Vite production build
- frontend telemetry interpolation tests
- backend Maven tests
- backend executable JAR build

The project includes Docker/PostGIS and Flutter integration support, but those environments should also be validated on the development machine before treating the module as production-ready.

---

# Completed Workflow

The current completed workflow is:

```text
Emergency / pickup request
        ↓
Patient pickup location available
        ↓
Nearby ambulances displayed
        ↓
Availability and capabilities evaluated
        ↓
Suitable ambulance selected
        ↓
Backend confirms assignment
        ↓
Driver receives confirmed assignment
        ↓
Patient pickup location delivered
        ↓
Navigation handoff
        ↓
Live ambulance telemetry
        ↓
Smooth vehicle movement on control-room map
```

---

# Development Boundary

This module ends at the ambulance dispatch and patient pickup-location delivery stage.

The next development stages can continue with areas such as:

- patient pickup workflow
- hospital selection
- hospital availability
- hospital resource allocation
- hospital assignment
- route from patient to hospital
- traffic coordination
- green corridor
- hospital preparation
- patient arrival
- emergency completion

These are intentionally outside the scope of this module.

---

# Important Design Rules

- Ambulance assignment is controlled by the backend.
- The driver does not Accept or Decline assignments.
- Driver acknowledgement only confirms receipt of an already-confirmed assignment.
- Ambulance selection is capability-based and not distance-only.
- Telemetry observations remain authoritative.
- Animation only interpolates between valid observations.
- Do not present simulated data as real emergency-service data.
- Do not expose secrets in the repository.
- Do not claim production emergency-service integration until real external integrations have been implemented and approved.

---

# Documentation

Additional documentation:

- `HANDOFF.md` — continuation notes for the next developers
- `docs/DRIVER-INTEGRATION.md` — Flutter/driver integration contract
- `docs/OPERATIONS.md` — operational behavior and system limitations
- `contracts/openapi.v1.yaml` — REST API contract
- `contracts/events.v1.json` — event contract

---

# Module Status

**Initial ambulance dispatch module: completed for team handoff.**

Current handoff point:

**Patient pickup input → capability-based ambulance selection → backend-confirmed assignment → driver receives exact pickup location/navigation → live telemetry-based ambulance movement.**

Further emergency-response modules can be integrated from this point.
