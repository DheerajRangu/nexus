import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const token = "super-secret-token-value-1234567890";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("link exchange", () => {
  it("shows an invalid token without revealing the secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.0.0", code: "TOKEN_INVALID", message: "no" }), { status: 401 })),
    );
    render(<App initialToken={token} startDemo={false} />);
    expect(await screen.findByRole("heading", { name: /not valid/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(token);
  });

  it("shows an expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.0.0", code: "TOKEN_EXPIRED", message: "no" }), { status: 401 })),
    );
    render(<App initialToken={token} startDemo={false} />);
    expect(await screen.findByRole("heading", { name: /has expired/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(token);
  });
});
