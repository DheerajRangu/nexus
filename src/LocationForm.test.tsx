import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LocationConfirmationRequest } from "../shared/contract";
import { LocationForm } from "./LocationForm";

const noopSearch = vi.fn(async () => ({ results: [], syntheticAddress: false }));
const noopReverse = vi.fn(async () => ({ result: null, syntheticAddress: false }));

describe("location confirmation", () => {
  it("shows the manual fallback when location permission is denied", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        },
      },
    });
    render(
      <LocationForm
        lang="en"
        mode="confirm"
        dispatchStarted={false}
        expectedLocationVersion={1}
        onSubmit={vi.fn()}
        onSearch={noopSearch}
        onReverse={noopReverse}
      />,
    );
    await user.click(screen.getByRole("button", { name: /share this phone/i }));
    expect(screen.getByText(/location permission is off/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/search address or landmark/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument();
  });

  it("warns that a correction after dispatch alerts the control room and driver", () => {
    render(
      <LocationForm
        lang="en"
        mode="correct"
        dispatchStarted
        expectedLocationVersion={2}
        onSubmit={vi.fn()}
        onSearch={noopSearch}
        onReverse={noopReverse}
      />,
    );
    expect(screen.getByTestId("correction-warning")).toHaveTextContent(/alerts the control room and the driver/i);
    expect(screen.getByTestId("correction-warning")).toHaveTextContent(/hospital destination does not change/i);
  });

  it("submits the pin, not the phone position", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_body: LocationConfirmationRequest) => undefined);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 17.1,
              longitude: 78.4,
              accuracy: 12,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON() {
                return this;
              },
            },
            timestamp: Date.parse("2026-10-05T12:00:00.000Z"),
            toJSON() {
              return this;
            },
          });
        },
      },
    });
    render(
      <LocationForm
        lang="en"
        mode="confirm"
        dispatchStarted={false}
        expectedLocationVersion={1}
        onSubmit={onSubmit}
        onSearch={noopSearch}
        onReverse={noopReverse}
      />,
    );
    await user.click(screen.getByRole("button", { name: /share this phone/i }));
    fireEvent.change(screen.getByLabelText(/^latitude$/i), { target: { value: "17.25" } });
    await user.click(screen.getByRole("radio", { name: /with the patient/i }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /confirm pickup location/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0][0];
    expect(body.confirmed).toBe(true);
    expect(body.pickup.latitude).toBe(17.25);
    expect(body.deviceObservation?.latitude).toBe(17.1);
    expect(body.pickup.latitude).not.toBe(body.deviceObservation?.latitude);
  });
});
