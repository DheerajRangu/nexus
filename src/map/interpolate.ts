import type { Telemetry } from "../../shared/contract";
import { isObservationStale } from "../format";

export interface DisplayPosition {
  latitude: number;
  longitude: number;
  animating: boolean;
  stale: boolean;
}

/**
 * Move only between the previous valid observation and the latest one.
 * Never extrapolate past the latest point. A stale fix stays where it was.
 */
export function interpolateObservation(
  previous: Telemetry | null,
  current: Telemetry,
  nowMs: number,
  elapsedAnimMs: number,
  allowAnimation: boolean,
): DisplayPosition {
  const stale = isObservationStale(current.observedAt, current.staleAfterSeconds, nowMs, current.stale);
  const parked: DisplayPosition = {
    latitude: current.latitude,
    longitude: current.longitude,
    animating: false,
    stale,
  };
  if (stale || !allowAnimation || !previous) return parked;
  if (previous.ambulanceId !== current.ambulanceId) return parked;
  const gap = Date.parse(current.observedAt) - Date.parse(previous.observedAt);
  if (!Number.isFinite(gap) || gap <= 0 || gap > current.staleAfterSeconds * 1000) return parked;
  const duration = Math.min(Math.max(gap, 400), 2500);
  if (elapsedAnimMs >= duration) return parked;
  const t = elapsedAnimMs / duration;
  return {
    latitude: previous.latitude + (current.latitude - previous.latitude) * t,
    longitude: previous.longitude + (current.longitude - previous.longitude) * t,
    animating: true,
    stale: false,
  };
}
