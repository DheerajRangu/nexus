import type { EntityName, TrackingEvent, TrackingSnapshot } from "../../shared/contract";

export interface ClientTrackingState {
  snapshot: TrackingSnapshot | null;
  needsResync: boolean;
  terminalError: "SESSION_EXPIRED" | null;
}

export type RejectReason = "duplicate" | "out_of_order" | "gap" | "other_mission" | "invalid" | "contract" | "expired";

export function applySnapshot(snapshot: TrackingSnapshot): ClientTrackingState {
  return { snapshot, needsResync: false, terminalError: null };
}

export function applyEvent(
  state: ClientTrackingState,
  event: TrackingEvent,
): { state: ClientTrackingState; applied: boolean; reason?: RejectReason } {
  if (!event.contractVersion.startsWith("1.")) {
    return { state, applied: false, reason: "contract" };
  }
  if (event.type === "session.expired") {
    if (state.snapshot && event.emergencyId !== state.snapshot.emergencyId) {
      return { state, applied: false, reason: "other_mission" };
    }
    return {
      state: { snapshot: null, needsResync: false, terminalError: "SESSION_EXPIRED" },
      applied: true,
      reason: "expired",
    };
  }
  if (!state.snapshot || !event.snapshot || event.entity === "session") {
    return { state, applied: false, reason: "invalid" };
  }
  if (event.emergencyId !== state.snapshot.emergencyId || event.snapshot.emergencyId !== state.snapshot.emergencyId) {
    return { state, applied: false, reason: "other_mission" };
  }
  const entity = event.entity as EntityName;
  const current = state.snapshot.versions[entity];
  if (event.version <= current) {
    return { state, applied: false, reason: event.version === current ? "duplicate" : "out_of_order" };
  }
  if (event.version > current + 1 || event.snapshot.stateVersion !== state.snapshot.stateVersion + 1) {
    return { state: { ...state, needsResync: true }, applied: false, reason: "gap" };
  }
  if (event.snapshot.versions[entity] !== event.version) {
    return { state, applied: false, reason: "invalid" };
  }
  return { state: { snapshot: event.snapshot, needsResync: false, terminalError: null }, applied: true };
}

/** Authoritative snapshot first, then only newer in-order events. */
export function recoverFromReconnect(snapshot: TrackingSnapshot, missed: TrackingEvent[]) {
  let state = applySnapshot(snapshot);
  const rejected: RejectReason[] = [];
  for (const event of missed) {
    const result = applyEvent(state, event);
    if (!result.applied) rejected.push(result.reason ?? "invalid");
    state = result.state;
  }
  return { state, rejected };
}
