import { core } from "../services/ecosystem";
/** Server-driven hospital demo. Browser timers never own missions or reservations. */
export class HospitalSimulationEngine {
  constructor(private hospitalId: string) {}
  start() {
    return core(`/api/hospital-command/${this.hospitalId}/demo-start`, {});
  }
  control(running: boolean, speed = 1) {
    return core(`/api/hospital-command/${this.hospitalId}/demo-control`, {
      enabled: running,
      speed,
    });
  }
}
export const hospitalDemoStages = [
  {
    at: 3,
    title: "Priority alert",
    action: "Incoming trauma notification",
    next: "Await confirmed destination",
  },
  {
    at: 10,
    title: "Hospital selected",
    action: "Shared dispatch assigned this receiving center",
    next: "Acknowledge and prepare",
  },
  {
    at: 14,
    title: "Preparation activated",
    action: "Receiving resources locked; team notified",
    next: "Confirm staff readiness",
  },
  {
    at: 30,
    title: "Receiving team ready",
    action: "Corridor coordination and preparation complete",
    next: "Monitor patient condition",
  },
  {
    at: 35,
    title: "Condition deteriorating",
    action: "Vitals changed; preparation checklist expanded",
    next: "Review airway equipment and anesthesia readiness",
  },
  {
    at: 40,
    title: "Preparation escalated",
    action: "Ventilator and airway resources reserved",
    next: "Monitor final approach",
  },
  {
    at: 45,
    title: "Route disrupted",
    action: "Shared routing recomputed around a road blockage",
    next: "Recheck arrival timing",
  },
  {
    at: 60,
    title: "Final preparation",
    action: "Receiving bay and staff readiness check",
    next: "Stand by at the gate",
  },
  {
    at: 70,
    title: "Ambulance arrived",
    action: "Hospital geofence stage reached in demo",
    next: "Start structured handover",
  },
  {
    at: 80,
    title: "Patient received",
    action: "Hospital takes ownership; ambulance released",
    next: "Continue hospital care",
  },
];
