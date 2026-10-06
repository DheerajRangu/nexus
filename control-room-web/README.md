# AEGIS Control Room Web

React/Vite command center dashboard for AEGIS dispatch operators.

## Run

```powershell
npm install
npm run dev
```

The app expects the Spring Boot API at `http://localhost:8082/api/control-room`.
Override it with:

```powershell
$env:VITE_CONTROL_ROOM_API="http://localhost:8082/api/control-room"
npm run dev
```
