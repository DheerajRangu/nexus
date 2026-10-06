import { describe, expect, it } from "vitest";
import type { TrackingEvent, TrackingSnapshot } from "../../shared/contract";
import { applyEvent, applySnapshot, recoverFromReconnect } from "./reduce";

function base(overrides: Partial<TrackingSnapshot> = {}): TrackingSnapshot {
  return {
    contractVersion: "1.0.0",
    synthetic: false,
    emergencyId: "emg_a",
    missionId: "msn_a",
    missionReference: "AG-1000",
    phase: "AMBULANCE_APPROACHING",
    statusKey: "status.approaching",
    explanationKey: "approaching",
    statusExplanation: "On the way.",
    dispatchDelayed: false,
    serverTime: "2026-10-05T12:00:00.000Z",
    updatedAt: "2026-10-05T12:00:00.000Z",
    accessExpiresAt: "2026-10-05T18:00:00.000Z",
    lastEventId: "5",
    stateVersion: 5,
    versions: { mission: 2, assignment: 1, telemetry: 5, route: 1, hospital: 0, location: 2 },
    location: { confirmationRequired: false, confirmedPickup: null, correction: null },
    assignment: {
      ambulanceId: "amb_214",
      unitLabel: "Unit 214",
      vehicleType: "Ambulance",
      registrationLabel: "AG-214",
    },
    telemetry: null,
    eta: null,
    route: null,
    hospital: null,
    permissions: {
      canConfirmLocation: false,
      canCorrectLocation: true,
      canContactControlRoom: true,
      canContactDriver: true,
    },
    ...overrides,
  };
}

function event(snapshot: TrackingSnapshot, version: number, entity: TrackingEvent["entity"] = "telemetry"): TrackingEvent {
  return {
    eventId: `evt_${version}`,
    sequence: version,
    contractVersion: "1.0.0",
    type: "telemetry.position",
    emergencyId: snapshot.emergencyId,
    missionId: snapshot.missionId,
    entity,
    version,
    occurredAt: "2026-10-05T12:00:01.000Z",
    snapshot,
  };
}

describe("event reducer", () => {
  it("rejects duplicate and out-of-order events", () => {
    const state = applySnapshot(base());
    const duplicate = applyEvent(state, event(base(), 5));
    expect(duplicate.applied).toBe(false);
    expect(duplicate.reason).toBe("duplicate");
    const older = applyEvent(state, event(base({ stateVersion: 4 }), 4));
    expect(older.applied).toBe(false);
    expect(older.reason).toBe("out_of_order");
    expect(older.state.snapshot?.assignment?.ambulanceId).toBe("amb_214");
  });

  it("does not apply a version gap and asks for a fresh snapshot", () => {
    const state = applySnapshot(base());
    const jumped = base({
      stateVersion: 8,
      assignment: {
        ambulanceId: "amb_other",
        unitLabel: "Unit 999",
        vehicleType: "Ambulance",
        registrationLabel: "AG-999",
      },
      versions: { mission: 2, assignment: 1, telemetry: 7, route: 1, hospital: 0, location: 2 },
    });
    const result = applyEvent(state, event(jumped, 7));
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("gap");
    expect(result.state.needsResync).toBe(true);
    expect(result.state.snapshot?.assignment?.ambulanceId).toBe("amb_214");
  });

  it("rejects another emergency and keeps the current ambulance", () => {
    const state = applySnapshot(base());
    const foreign = base({
      emergencyId: "emg_b",
      stateVersion: 6,
      versions: { mission: 2, assignment: 1, telemetry: 6, route: 1, hospital: 0, location: 2 },
      assignment: {
        ambulanceId: "amb_b",
        unitLabel: "Unit B",
        vehicleType: "Ambulance",
        registrationLabel: "AG-B",
      },
    });
    const result = applyEvent(state, event(foreign, 6));
    expect(result.reason).toBe("other_mission");
    expect(result.state.snapshot?.assignment?.ambulanceId).toBe("amb_214");
    expect(result.state.snapshot?.emergencyId).toBe("emg_a");
  });

  it("reconnect applies the authoritative snapshot and rejects old events", () => {
    const snapshot = base({
      stateVersion: 6,
      lastEventId: "6",
      versions: { mission: 2, assignment: 2, telemetry: 5, route: 1, hospital: 0, location: 2 },
      assignment: {
        ambulanceId: "amb_308",
        unitLabel: "Unit 308",
        vehicleType: "Ambulance",
        registrationLabel: "AG-308",
      },
    });
    const staleEvent = event(
      base({
        stateVersion: 5,
        assignment: {
          ambulanceId: "amb_214",
          unitLabel: "Unit 214",
          vehicleType: "Ambulance",
          registrationLabel: "AG-214",
        },
      }),
      4,
    );
    const nextTelemetry = base({
      ...snapshot,
      stateVersion: 7,
      versions: { ...snapshot.versions, telemetry: 6 },
      telemetry: {
        ambulanceId: "amb_308",
        latitude: 17.4,
        longitude: 78.5,
        accuracyMeters: 10,
        observedAt: "2026-10-05T12:01:00.000Z",
        stale: false,
        staleAfterSeconds: 45,
      },
    });
    const recovered = recoverFromReconnect(snapshot, [staleEvent, event(nextTelemetry, 6)]);
    expect(recovered.rejected).toContain("out_of_order");
    expect(recovered.state.snapshot?.assignment?.unitLabel).toBe("Unit 308");
    expect(recovered.state.snapshot?.telemetry?.ambulanceId).toBe("amb_308");
    expect(recovered.state.snapshot?.stateVersion).toBe(7);
  });
});
