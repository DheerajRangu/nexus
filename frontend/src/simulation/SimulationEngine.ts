/** API adapter only: simulation time, GPS and lifecycle live on the server. */
type Perform = (
  path: string,
  body?: unknown,
  method?: string,
) => Promise<unknown>;
export class SimulationEngine {
  constructor(private readonly perform: Perform) {}
  start() {
    return this.perform("/api/demo/start");
  }
  reset() {
    return this.perform("/api/demo/reset");
  }
  pause() {
    return this.perform("/api/demo/control", { running: false }, "PATCH");
  }
  resume() {
    return this.perform("/api/demo/control", { running: true }, "PATCH");
  }
  setSpeed(speed: 1 | 2 | 5) {
    return this.perform("/api/demo/control", { speed }, "PATCH");
  }
  trigger(type: string, incidentId?: string) {
    return this.perform("/api/demo/event", { type, incidentId });
  }
}
