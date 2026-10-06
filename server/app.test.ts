// @vitest-environment node
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type { LocationConfirmationRequest } from "../shared/contract";
import { createApp, type AppOptions } from "./app";

const logs: string[] = [];

function testApp(overrides: Partial<AppOptions> = {}) {
  logs.length = 0;
  return createApp({
    now: () => Date.now(),
    mode: "development",
    controlRoomPhone: "108",
    driverRelayPhone: "108",
    tokenTtlMs: 60_000,
    sessionTtlMs: 60_000,
    activeAccessTtlMs: 60_000,
    terminalAccessTtlMs: 60_000,
    staleAfterSeconds: 45,
    logger: (line) => logs.push(line),
    ...overrides,
  });
}

function locationBody(version: number, pickupLat = 17.39, deviceLat = 17.2): LocationConfirmationRequest {
  return {
    clientSubmissionId: `sub_${version}_${pickupLat}`,
    expectedLocationVersion: version,
    role: "WITH_PATIENT",
    confirmed: true,
    pickup: {
      latitude: pickupLat,
      longitude: 78.48,
      accuracyMeters: null,
      observedAt: new Date().toISOString(),
      source: "MANUAL_PIN",
    },
    deviceObservation: {
      latitude: deviceLat,
      longitude: 78.4,
      accuracyMeters: 20,
      observedAt: new Date().toISOString(),
      source: "BROWSER_GPS",
    },
    addressFormatted: "Demonstration Junction",
    notes: { landmark: "Blue gate", floor: "2", building: "A", gate: "North", access: "Lift" },
  };
}

describe("citizen development adapter", () => {
  const open: Array<{ store: { stop: () => void } }> = [];

  afterEach(() => {
    for (const item of open) item.store.stop();
    open.length = 0;
  });

  it("rejects invalid and expired tokens without logging the secret", async () => {
    const ctx = testApp();
    open.push(ctx);
    const missing = await request(ctx.app).post("/api/v1/citizen/sessions").send({ linkToken: "not-a-real-tracking-token-value" });
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe("TOKEN_INVALID");
    expect(missing.body.emergencyId).toBeUndefined();

    const expired = ctx.store.issueToken({ ttlMs: -1000, autoplay: false });
    const expiredRes = await request(ctx.app).post("/api/v1/citizen/sessions").send({ linkToken: expired.token });
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.code).toBe("TOKEN_EXPIRED");

    const revoked = ctx.store.issueToken({ autoplay: false });
    ctx.store.revokeToken(revoked.token);
    const revokedRes = await request(ctx.app).post("/api/v1/citizen/sessions").send({ linkToken: revoked.token });
    expect(revokedRes.status).toBe(401);
    expect(revokedRes.body.code).toBe("TOKEN_REVOKED");
    expect(logs.join("\n")).not.toContain(expired.token);
    expect(logs.join("\n")).not.toContain(revoked.token);
  });

  it("exchanges a link token for an httpOnly session and hides other emergencies", async () => {
    const ctx = testApp();
    open.push(ctx);
    const issued = ctx.store.issueToken({ autoplay: false });
    const other = ctx.store.issueToken({ autoplay: false });
    const agent = request.agent(ctx.app);
    const exchanged = await agent.post("/api/v1/citizen/sessions").send({ linkToken: issued.token });
    expect(exchanged.status).toBe(200);
    expect(exchanged.body.tracking.synthetic).toBe(true);
    expect(exchanged.body.tracking.emergencyId).toBe(issued.emergencyId);
    expect(exchanged.body.tracking.missionReference).toMatch(/^AG-DEMO-/);
    expect(exchanged.body.linkToken).toBeUndefined();
    const cookie = String(exchanged.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toContain(issued.token);
    expect(JSON.stringify(exchanged.body)).not.toMatch(/diagnosis|medicalRecord|fleet/i);

    const denied = await agent.get("/api/v1/citizen/tracking").query({ emergencyId: other.emergencyId });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("CROSS_MISSION_DENIED");
    expect(JSON.stringify(denied.body)).not.toContain(other.emergencyId);

    const listing = await agent.get("/api/v1/citizen/emergencies");
    expect(listing.status).toBe(404);
  });

  it("keeps the confirmed pickup separate from the device and alerts on correction after dispatch", async () => {
    const ctx = testApp();
    open.push(ctx);
    const agent = request.agent(ctx.app);
    const started = await agent.post("/api/v1/citizen/demo/sessions").send({ autoplay: false });
    expect(started.body.label).toBe("DEVELOPMENT DEMO");
    expect(started.body.tracking.synthetic).toBe(true);
    expect(started.body.tracking.phase).toBe("COORDINATING");
    expect(started.body.tracking.statusKey).toBe("status.coordinating");

    const confirmed = await agent.post("/api/v1/citizen/location").send(locationBody(started.body.tracking.versions.location));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.tracking.location.confirmedPickup.latitude).toBe(17.39);
    expect(JSON.stringify(confirmed.body.tracking)).not.toContain("17.2");
    expect(confirmed.body.alerts).toEqual({ controlRoom: false, driver: false, hospitalChanged: false });

    const assigned = await agent.post("/api/v1/citizen/demo/advance").send({ step: "assign" });
    expect(assigned.body.tracking.phase).toBe("AMBULANCE_ASSIGNED");
    const unit = assigned.body.tracking.assignment.unitLabel;
    expect(unit).toBe("Unit 214");

    const moved = await agent.post("/api/v1/citizen/demo/advance").send({ step: "telemetry" });
    expect(moved.body.tracking.telemetry.stale).toBe(false);
    expect(moved.body.tracking.eta.demonstration).toBe(true);

    const stale = await agent.post("/api/v1/citizen/demo/advance").send({ step: "stale_telemetry" });
    expect(stale.body.tracking.telemetry.stale).toBe(true);
    expect(stale.body.tracking.eta).toBeNull();

    await agent.post("/api/v1/citizen/demo/advance").send({ step: "at_pickup" });
    const travelling = await agent.post("/api/v1/citizen/demo/advance").send({ step: "travel" });
    const hospitalId = travelling.body.tracking.hospital.hospitalId;
    expect(hospitalId).toBe("hosp_demo_general");

    const corrected = await agent
      .post("/api/v1/citizen/location")
      .send(locationBody(travelling.body.tracking.versions.location, 17.41, 17.11));
    expect(corrected.status).toBe(200);
    expect(corrected.body.alerts).toEqual({ controlRoom: true, driver: true, hospitalChanged: false });
    expect(corrected.body.tracking.hospital.hospitalId).toBe(hospitalId);
    expect(corrected.body.tracking.location.confirmedPickup.latitude).toBe(17.41);
    expect(corrected.body.tracking.location.correction.alertedDriver).toBe(true);

    const changed = await agent.post("/api/v1/citizen/demo/advance").send({ step: "change_hospital" });
    expect(changed.body.tracking.hospital.hospitalId).toBe("hosp_demo_south");
    expect(changed.body.tracking.location.confirmedPickup.latitude).toBe(17.41);
  });

  it("replaces the assigned ambulance without keeping the previous vehicle position", async () => {
    const ctx = testApp();
    open.push(ctx);
    const agent = request.agent(ctx.app);
    await agent.post("/api/v1/citizen/demo/sessions").send({ autoplay: false });
    const located = await agent.post("/api/v1/citizen/location").send(locationBody(1));
    expect(located.status).toBe(200);
    await agent.post("/api/v1/citizen/demo/advance").send({ step: "assign" });
    await agent.post("/api/v1/citizen/demo/advance").send({ step: "telemetry" });
    const changed = await agent.post("/api/v1/citizen/demo/advance").send({ step: "change_assignment" });
    expect(changed.status).toBe(200);
    expect(changed.body.tracking.assignment.unitLabel).toBe("Unit 308");
    expect(changed.body.tracking.telemetry).toBeNull();
    expect(changed.body.tracking.phase).toBe("AMBULANCE_ASSIGNED");
  });

  it("does not invent a mission when the backend proxy is down", async () => {
    const ctx = testApp({ mode: "proxy", backendBaseUrl: "http://127.0.0.1:9" });
    open.push(ctx);
    const demo = await request(ctx.app).post("/api/v1/citizen/demo/sessions").send({});
    expect(demo.status).toBe(404);
    expect(demo.body.code).toBe("DEMO_DISABLED");
    const tracking = await request(ctx.app).get("/api/v1/citizen/tracking");
    expect(tracking.status).toBe(503);
    expect(tracking.body.code).toBe("UNAVAILABLE");
    expect(JSON.stringify(tracking.body)).not.toContain("AG-DEMO");
  });

  it("localizes the backend explanation", async () => {
    const ctx = testApp();
    open.push(ctx);
    const response = await request(ctx.app).post("/api/v1/citizen/demo/sessions").set("Accept-Language", "te").send({ autoplay: false });
    expect(response.body.tracking.statusExplanation).toMatch(/[\u0C00-\u0C7F]/);
  });
});
