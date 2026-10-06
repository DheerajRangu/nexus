/** Isolated city demo only. AEGIS_COMMAND_URL defaults to localhost:5182. */
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch({
    headless: process.env.AEGIS_TEST_HEADLESS === "true",
  });
  const errors = [];
  const result = {};
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const origin = process.env.AEGIS_COMMAND_URL || "http://localhost:5182";
    await page.goto(origin + "/control-room");
    await page
      .getByRole("button", { name: "Open command room", exact: true })
      .click();
    await page.locator(".command-center").waitFor();
    await page.locator(".command-boot").waitFor({ state: "hidden" });
    const request = page.request;
    const post = async (path, data = {}) => {
      const r = await request.post(origin + path, { data });
      if (!r.ok()) throw Error(await r.text());
      return r.json();
    };
    const waitState = async (predicate) => {
      const deadline = Date.now() + 12000;
      let value;
      do {
        value = await city();
        if (predicate(value)) return value;
        await page.waitForTimeout(150);
      } while (Date.now() < deadline);
      throw Error("Timed out waiting for shared state");
    };
    const city = async () => {
      const r = await request.get(origin + "/api/ecosystem/state");
      return (await r.json()).state;
    };
    await post("/api/demo/reset");
    await request.patch(origin + "/api/demo/control", {
      data: { running: false },
    });
    await page.locator(".unit-node").first().waitFor();
    let state = await city();
    result.seedCounts = Object.fromEntries(
      [
        "ambulances",
        "hospitals",
        "cameras",
        "incidents",
        "roadEvents",
        "corridors",
      ].map((k) => [k, state[k].length]),
    );
    if (
      state.ambulances.length !== 22 ||
      state.hospitals.length !== 12 ||
      state.cameras.length !== 18
    )
      throw Error("Incorrect seed counts");
    const unit = state.ambulances[0].location;
    await page.getByRole("button", { name: "Start demo", exact: true }).click();
    await page.waitForTimeout(2400);
    state = await city();
    if (JSON.stringify(state.ambulances[0].location) === JSON.stringify(unit))
      throw Error("Ambulances did not move");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    result.movementVerified = true;
    const paused = await waitState((s) => !s.simulationControl.running);
    await page.waitForTimeout(1500);
    if ((await city()).simulationControl.tick !== paused.simulationControl.tick)
      throw Error("Pause did not stop authoritative simulation");
    result.pauseVerified = true;
    await page
      .getByRole("button", { name: "Create emergency", exact: true })
      .last()
      .click();
    await page
      .getByLabel("Patient / caller")
      .fill("Command acceptance patient");
    await page
      .getByRole("button", { name: "Create & run AI dispatch", exact: true })
      .click();
    await page.locator(".create-emergency-modal").waitFor({ state: "hidden" });
    await page
      .getByTestId("command-incident-status")
      .filter({ hasText: "CREATED" })
      .waitFor();
    state = await city();
    const i = state.incidents.at(-1);
    result.manualIncident = i.id;
    if (i.status !== "CREATED" || i.ambulanceId)
      throw Error("Manual dispatch skipped recommendation");
    await page
      .getByRole("button", { name: "Accept AI dispatch", exact: true })
      .click();
    await page
      .getByTestId("command-incident-status")
      .filter({ hasText: "DRIVER NOTIFIED" })
      .waitFor();
    result.manualDispatchVerified = true;
    const active = state.incidents.find(
      (i) => i.status === "EN_ROUTE_TO_HOSPITAL",
    );
    await page.locator(".incident-card").filter({ hasText: active.id }).click();
    const before = await city();
    const oldroute = before.incidents.find((i) => i.id === active.id).routeId;
    await page
      .getByRole("button", { name: "+ ROADBLOCK", exact: true })
      .click();
    let after = await waitState(
      (s) => s.incidents.find((i) => i.id === active.id).routeId !== oldroute,
    );
    if (after.incidents.find((i) => i.id === active.id).routeId === oldroute)
      throw Error("Road block did not change route");
    result.roadRerouteVerified = true;
    await page
      .getByRole("button", { name: "+ CAMERA ALERT", exact: true })
      .click();
    after = await waitState((s) =>
      s.cameras.some((c) => c.detection?.simulation),
    );
    if (!after.cameras.some((c) => c.detection?.simulation))
      throw Error("Camera demo did not emit detection");
    result.cameraEventVerified = true;
    await page.getByRole("button", { name: "+ ICU FULL", exact: true }).click();
    after = await waitState(
      (s) =>
        s.incidents.find((i) => i.id === active.id).hospitalId !==
        active.hospitalId,
    );
    if (
      after.incidents.find((i) => i.id === active.id).hospitalId ===
      active.hospitalId
    )
      throw Error("Capacity loss did not divert");
    result.capacityDiversionVerified = true;
    await page
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    const alert = page.locator(".alert-card").first();
    await alert
      .getByRole("button", { name: "acknowledge", exact: true })
      .click();
    await waitState((s) =>
      Object.values(s.alertStatus || {}).includes("acknowledge"),
    );
    result.alertAcknowledgementVerified = true;
    await page.locator(".notification-drawer .section-heading button").click();
    await page.keyboard.press("Control+k");
    await page
      .getByPlaceholder("Search incidents, units, hospitals, cameras…")
      .fill("AMB-07");
    await page.locator(".palette-results button").first().click();
    await page
      .locator(".command-right section")
      .filter({ hasText: "AMB-07" })
      .first()
      .waitFor();
    result.searchVerified = true;
    for (const name of [
      "Ambulance Fleet",
      "Hospital Network",
      "Road Intelligence",
      "Camera AI",
      "Green Corridor",
      "AI Intelligence",
      "Analytics",
      "System Health",
      "Event History",
      "Live Operations",
    ]) {
      await page
        .locator(".command-left nav")
        .getByRole("button", { name, exact: true })
        .click();
      await page.waitForTimeout(100);
    }
    await page.getByLabel("Map mode").selectOption("CAMERAS");
    await page.locator(".camera-node").first().click();
    await page
      .getByRole("button", { name: "View camera & evidence", exact: true })
      .click();
    await page.locator(".camera-modal .omnivision").waitFor();
    await page.locator(".camera-modal>.section-heading button").click();
    result.cameraDrawerVerified = true;
    await page.getByLabel("Map mode").selectOption("NORMAL");
    await page.getByTitle("Collapse left panel").click();
    if (
      !(await page
        .locator(".command-center")
        .evaluate((el) => el.classList.contains("left-collapsed")))
    )
      throw Error("Panel collapse failed");
    await page.getByTitle("Collapse left panel").click();
    await page.getByLabel("Map mode").selectOption("HOSPITALS");
    if (await page.locator(".unit-node").count())
      throw Error("Map layer did not filter");
    await page.getByLabel("Map mode").selectOption("NORMAL");
    result.layersAndPanelsVerified = true;
    const output = "/tmp/aegis-command-flow";
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1920, 1440, 1366, 768, 390]) {
      await page.setViewportSize({ width, height: width < 800 ? 900 : 1080 });
      await page.screenshot({
        path: output + "/command-" + width + ".png",
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 2,
      );
      if (overflow) throw Error("Horizontal overflow at " + width);
    }
    result.responsiveVerified = true;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await request.patch(origin + "/api/demo/control", {
      data: { speed: 5, auto: true, running: true },
    });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      state = await city();
      if (state.incidents.some((i) => i.status === "COMPLETED")) break;
      await page.waitForTimeout(1000);
    }
    if (!state.incidents.some((i) => i.status === "COMPLETED"))
      throw Error("No automatic handover completed");
    await request.patch(origin + "/api/demo/control", {
      data: { running: false },
    });
    result.automaticCompletionVerified = true;
    result.browserErrors = errors;
    if (errors.length) throw Error(errors.join("; "));
    fs.writeFileSync(output + "/results.json", JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
