import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TrackingSnapshot } from "../shared/contract";
import { CitizenExperience, type ViewModel } from "./CitizenExperience";

function snapshot(overrides: Partial<TrackingSnapshot> = {}): TrackingSnapshot {
  return {
    contractVersion: "1.0.0",
    synthetic: true,
    emergencyId: "emg_demo",
    missionId: "msn_demo",
    missionReference: "AG-DEMO-1000",
    phase: "AMBULANCE_APPROACHING",
    statusKey: "status.approaching",
    explanationKey: "approaching",
    statusExplanation: "The assigned ambulance is travelling to the confirmed pickup point.",
    dispatchDelayed: false,
    serverTime: "2026-10-05T12:00:00.000Z",
    updatedAt: "2026-10-05T12:00:00.000Z",
    accessExpiresAt: "2026-10-05T18:00:00.000Z",
    lastEventId: "4",
    stateVersion: 4,
    versions: { mission: 3, assignment: 1, telemetry: 2, route: 1, hospital: 0, location: 2 },
    location: { confirmationRequired: false, confirmedPickup: null, correction: null },
    assignment: {
      ambulanceId: "amb_214",
      unitLabel: "Unit 214",
      vehicleType: "Ambulance",
      registrationLabel: "DEMO-214",
    },
    telemetry: {
      ambulanceId: "amb_214",
      latitude: 17.4,
      longitude: 78.49,
      accuracyMeters: 20,
      observedAt: new Date().toISOString(),
      stale: false,
      staleAfterSeconds: 45,
    },
    eta: {
      estimatedArrivalAt: new Date(Date.now() + 99 * 60 * 1000).toISOString(),
      destination: "PICKUP",
      source: "ROUTING",
      demonstration: true,
    },
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

function tracking(value: TrackingSnapshot): ViewModel {
  return { kind: "tracking", snapshot: value, connection: "live", needsResync: false };
}

const handlers = {
  onLang: vi.fn(),
  onSubmitLocation: vi.fn(),
  onSearch: vi.fn(),
  onReverse: vi.fn(),
  onContact: vi.fn(),
  onDemoStep: vi.fn(),
  onRetry: vi.fn(),
};

describe("tracking screen", () => {
  it("does not request location in the synthetic flow and offers WhatsApp", () => {
    render(
      <CitizenExperience
        lang="en"
        model={tracking(snapshot({ location: { confirmationRequired: true, confirmedPickup: null, correction: null }, permissions: { ...snapshot().permissions, canConfirmLocation: true } }))}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("demo-location-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("location-form")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open whatsapp/i })).toHaveAttribute("href", "https://wa.me/");
  });

  it("shows an assignment change", () => {
    const { rerender } = render(<CitizenExperience lang="en" model={tracking(snapshot())} {...handlers} />);
    expect(screen.getByTestId("ambulance-label")).toHaveTextContent("Unit 214");
    rerender(
      <CitizenExperience
        lang="en"
        model={tracking(
          snapshot({
            assignment: {
              ambulanceId: "amb_308",
              unitLabel: "Unit 308",
              vehicleType: "Ambulance",
              registrationLabel: "DEMO-308",
            },
          }),
        )}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("ambulance-label")).toHaveTextContent("Unit 308");
    expect(screen.getByTestId("assignment-changed")).toHaveTextContent(/assigned ambulance has changed/i);
  });

  it("labels a stale position and does not show an arrival countdown", () => {
    render(
      <CitizenExperience
        lang="en"
        model={tracking(
          snapshot({
            telemetry: {
              ambulanceId: "amb_214",
              latitude: 17.4,
              longitude: 78.49,
              accuracyMeters: 40,
              observedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
              stale: true,
              staleAfterSeconds: 45,
            },
          }),
        )}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("eta")).toHaveTextContent(/last known position/i);
    expect(screen.getByTestId("eta")).not.toHaveTextContent(/99 min/i);
    expect(screen.getByTestId("stale-chip")).toBeInTheDocument();
  });

  it("keeps a live snapshot free of the demonstration banner", () => {
    render(
      <CitizenExperience
        lang="en"
        model={tracking(snapshot({ synthetic: false, eta: null, missionReference: "AG-1000" }))}
        {...handlers}
      />,
    );
    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument();
    expect(screen.getByText(/AG-1000/)).toBeInTheDocument();
  });

  it("shows invalid, expired, and cross-mission denials without mission details", () => {
    const { rerender } = render(<CitizenExperience lang="en" model={{ kind: "error", code: "TOKEN_INVALID" }} {...handlers} />);
    expect(screen.getByRole("heading", { name: /not valid/i })).toBeInTheDocument();
    expect(screen.queryByText(/AG-DEMO/)).not.toBeInTheDocument();

    rerender(<CitizenExperience lang="en" model={{ kind: "error", code: "TOKEN_EXPIRED" }} {...handlers} />);
    expect(screen.getByRole("heading", { name: /has expired/i })).toBeInTheDocument();

    rerender(<CitizenExperience lang="en" model={{ kind: "error", code: "CROSS_MISSION_DENIED" }} {...handlers} />);
    expect(screen.getByRole("heading", { name: /cannot open another emergency/i })).toBeInTheDocument();
    expect(screen.queryByTestId("ambulance-label")).not.toBeInTheDocument();
  });
});
