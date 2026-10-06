# AEGIS — connected emergency response

A full-screen Hyderabad command center with 22 moving demo ambulances, 12 hospitals, 18 cameras, WebSocket updates and operator controls. [Command-center guide](docs/COMMAND_CENTER.md).

One incident, one persistent backend, four realtime interfaces. Citizen SOS → capability-aware dispatch → driver GPS → patient pickup → hospital acceptance → simulated green corridor → live camera evidence → route/ETA updates → handover.

One incident, one persistent backend, four realtime interfaces. Citizen SOS → capability-aware dispatch → backend-confirmed driver assignment → driver GPS → patient pickup → hospital acceptance → simulated green corridor → live camera evidence → route/ETA updates → handover. Driver receipt and acknowledgement record delivery; drivers do not Accept or Decline assignments.

The command room includes the live OmniVision canvas, visual transcript, captured evidence and printable PDF report. Significant findings from registered cameras affect active ambulance routes.

Start the API and web from repository root:

```sh
source .venv/bin/activate
pip install -r requirements.txt
npm ci
uvicorn backend.main:app --host 127.0.0.1 --port 8000
# In another terminal:
npm run dev
```

Open http://localhost:5173/control-room and enter the command demo. An empty city initializes automatically. Pause/1X/2X/5X, manual dispatch, controlled road/camera events and chaos are server-backed. Use separate browser profiles for /citizen, /driver and /hospital. Clean-checkout prerequisites/model preparation: [Setup](docs/SETUP.md). Complete demo: [Demo flow](docs/DEMO_FLOW.md).

[Architecture](docs/ARCHITECTURE.md) · [Branch integration](docs/BRANCH_INTEGRATION.md) · [Integration report](INTEGRATION_REPORT.md) · [API](docs/API.md) · [Realtime events](docs/REALTIME_EVENTS.md) · [Database](docs/DATABASE.md) · [Vision details](docs/OMNIVISION.md) · [Scenario testing](docs/SCENARIO_TESTING.md)

Routes/signals are explicitly simulated geographic providers. Optional Google Maps is a display provider. Clinical severity requires EMT confirmation; this demo does not contact real emergency services. See architecture/setup for native and deployment integration boundaries.

Hospital receiving center: open `/hospital` for patient preparation, shared resource reservations, team readiness and MIST handover. See [Hospital command guide](docs/HOSPITAL_COMMAND.md).

Citizen portal: `/citizen` now provides a three-step emergency request, confirmed pickup and live scoped tracking. See [Citizen portal guide](docs/CITIZEN_PORTAL.md).
