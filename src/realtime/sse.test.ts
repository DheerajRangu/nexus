import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "./sse";

describe("sse parser", () => {
  it("reads event frames and keeps a partial chunk", () => {
    const parsed = parseSseBuffer("id: 4\nevent: telemetry.position\ndata: {\"ok\":true}\n\n: ping\n\ndata: par");
    expect(parsed.frames).toEqual([{ event: "telemetry.position", id: "4", data: "{\"ok\":true}" }]);
    expect(parsed.rest).toContain("par");
  });
});
