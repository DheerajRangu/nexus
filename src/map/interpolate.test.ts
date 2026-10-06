import { describe, expect, it } from "vitest";
import type { Telemetry } from "../../shared/contract";
import { interpolateObservation } from "./interpolate";

const now = Date.parse("2026-10-05T12:00:10.000Z");

function fix(partial: Partial<Telemetry>): Telemetry {
  return {
    ambulanceId: "amb_214",
    latitude: 17.4,
    longitude: 78.4,
    accuracyMeters: 10,
    observedAt: "2026-10-05T12:00:10.000Z",
    stale: false,
    staleAfterSeconds: 45,
    ...partial,
  };
}

describe("telemetry interpolation", () => {
  it("stops on stale telemetry and keeps the last-known point", () => {
    const previous = fix({ latitude: 17.1, observedAt: "2026-10-05T11:50:00.000Z" });
    const current = fix({ latitude: 17.2, observedAt: "2026-10-05T11:58:00.000Z", stale: true });
    const display = interpolateObservation(previous, current, now, 200, true);
    expect(display.stale).toBe(true);
    expect(display.animating).toBe(false);
    expect(display.latitude).toBe(17.2);
  });

  it("does not move past the latest observation", () => {
    const previous = fix({ latitude: 10, longitude: 20, observedAt: "2026-10-05T12:00:09.000Z" });
    const current = fix({ latitude: 12, longitude: 22, observedAt: "2026-10-05T12:00:10.000Z" });
    const midway = interpolateObservation(previous, current, now, 500, true);
    expect(midway.animating).toBe(true);
    expect(midway.latitude).toBeGreaterThan(10);
    expect(midway.latitude).toBeLessThan(12);
    const finished = interpolateObservation(previous, current, now, 5000, true);
    expect(finished.animating).toBe(false);
    expect(finished.latitude).toBe(12);
    expect(finished.longitude).toBe(22);
  });

  it("does not glide from a different ambulance", () => {
    const previous = fix({ ambulanceId: "amb_214", latitude: 1, observedAt: "2026-10-05T12:00:09.000Z" });
    const current = fix({ ambulanceId: "amb_308", latitude: 9, observedAt: "2026-10-05T12:00:10.000Z" });
    const display = interpolateObservation(previous, current, now, 200, true);
    expect(display.latitude).toBe(9);
    expect(display.animating).toBe(false);
  });
});
