import type { Coordinates, Telemetry } from './domain';

export interface Observation { coordinates: Coordinates; capturedAt: number; bearingDegrees?: number; }
export function interpolate(observations: Observation[], at: number, staleAfterMs = 90_000): Coordinates | undefined {
  if (!observations.length) return undefined;
  const ordered = [...observations].sort((a, b) => a.capturedAt - b.capturedAt);
  const last = ordered.at(-1)!;
  if (at - last.capturedAt > staleAfterMs || at <= ordered[0].capturedAt) return last.coordinates;
  const next = ordered.find((item) => item.capturedAt >= at);
  if (!next) return last.coordinates;
  const previous = ordered[ordered.indexOf(next) - 1];
  if (!previous) return next.coordinates;
  const ratio = Math.max(0, Math.min(1, (at - previous.capturedAt) / (next.capturedAt - previous.capturedAt)));
  return { latitude: previous.coordinates.latitude + (next.coordinates.latitude - previous.coordinates.latitude) * ratio, longitude: previous.coordinates.longitude + (next.coordinates.longitude - previous.coordinates.longitude) * ratio };
}
export const observationFromTelemetry = (telemetry: Telemetry): Observation => ({ coordinates: telemetry.coordinates, capturedAt: Date.parse(telemetry.capturedAt), bearingDegrees: telemetry.bearingDegrees });
