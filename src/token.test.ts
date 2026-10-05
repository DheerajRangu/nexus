import { describe, expect, it } from "vitest";
import { consumeTrackingToken } from "./token";

describe("tracking link", () => {
  it("removes the token from the address before any later request", () => {
    let next = "";
    const token = consumeTrackingToken({ pathname: "/t/abcDEF_123" }, (path) => {
      next = path;
    });
    expect(token).toBe("abcDEF_123");
    expect(next).toBe("/");
  });
});
