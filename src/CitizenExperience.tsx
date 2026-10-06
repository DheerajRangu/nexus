import { useEffect, useRef, useState } from "react";
import type { DemoStep, Lang, LocationAlerts, LocationConfirmationRequest, PlaceResult, TrackingSnapshot } from "../shared/contract";
import { formatLocalTime, isObservationStale, minutesUntil } from "./format";
import { explanationText, translate, type Translation } from "./i18n";
import { LocationForm } from "./LocationForm";
import { TrackingMap } from "./map/TrackingMap";

export type ViewModel =
  | { kind: "boot"; demo: boolean }
  | { kind: "welcome" }
  | { kind: "error"; code: string }
  | { kind: "tracking"; snapshot: TrackingSnapshot; connection: "live" | "reconnecting"; needsResync: boolean };

const DEMO_ACTIONS: Array<{ step: DemoStep; label: keyof Translation }> = [
  { step: "assign", label: "stepAssign" },
  { step: "telemetry", label: "stepMove" },
  { step: "at_pickup", label: "stepPickup" },
  { step: "travel", label: "stepTravel" },
  { step: "change_assignment", label: "stepChangeUnit" },
  { step: "change_hospital", label: "stepChangeHospital" },
  { step: "stale_telemetry", label: "stepStale" },
  { step: "cancel", label: "stepCancel" },
  { step: "complete", label: "stepComplete" },
];

export function CitizenExperience(props: {
  model: ViewModel;
  lang: Lang;
  onLang: (lang: Lang) => void;
  onSubmitLocation: (body: LocationConfirmationRequest) => Promise<LocationAlerts>;
  onSearch: (query: string) => Promise<{ results: PlaceResult[]; syntheticAddress: boolean }>;
  onReverse: (point: { latitude: number; longitude: number }) => Promise<{ result: PlaceResult | null; syntheticAddress: boolean }>;
  onContact: (kind: "control-room" | "driver") => Promise<void>;
  onDemoStep: (step: DemoStep) => Promise<void>;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-teal">AEGIS</p>
          <h1 className="text-xl font-semibold text-ink">{translate(props.lang, "brandSub")}</h1>
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1" role="group" aria-label="Language">
          {(["en", "te", "hi"] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={`min-h-10 min-w-10 rounded-lg px-2 text-sm font-semibold ${props.lang === code ? "bg-ink text-white" : "text-ink"}`}
              aria-pressed={props.lang === code}
              onClick={() => props.onLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <Screen {...props} />
    </div>
  );
}

function Screen(props: {
  model: ViewModel;
  lang: Lang;
  onSubmitLocation: (body: LocationConfirmationRequest) => Promise<LocationAlerts>;
  onSearch: (query: string) => Promise<{ results: PlaceResult[]; syntheticAddress: boolean }>;
  onReverse: (point: { latitude: number; longitude: number }) => Promise<{ result: PlaceResult | null; syntheticAddress: boolean }>;
  onContact: (kind: "control-room" | "driver") => Promise<void>;
  onDemoStep: (step: DemoStep) => Promise<void>;
  onRetry: () => void;
}) {
  if (props.model.kind === "boot") {
    return <p className="text-lg">{translate(props.lang, props.model.demo ? "startingDemo" : "checkingLink")}</p>;
  }
  if (props.model.kind === "welcome") {
    return (
      <section className="card space-y-4">
        <p className="text-lg">{translate(props.lang, "openSms")}</p>
        <a className="btn btn-primary" href="/demo">
          {translate(props.lang, "openDemo")}
        </a>
        <p className="text-sm text-muted">{translate(props.lang, "demoNote")}</p>
      </section>
    );
  }
  if (props.model.kind === "error") {
    return <ErrorState lang={props.lang} code={props.model.code} onRetry={props.onRetry} />;
  }
  return <TrackingScreen {...props} model={props.model} />;
}

function TrackingScreen(props: {
  model: Extract<ViewModel, { kind: "tracking" }>;
  lang: Lang;
  onSubmitLocation: (body: LocationConfirmationRequest) => Promise<LocationAlerts>;
  onSearch: (query: string) => Promise<{ results: PlaceResult[]; syntheticAddress: boolean }>;
  onReverse: (point: { latitude: number; longitude: number }) => Promise<{ result: PlaceResult | null; syntheticAddress: boolean }>;
  onContact: (kind: "control-room" | "driver") => Promise<void>;
  onDemoStep: (step: DemoStep) => Promise<void>;
}) {
  const snapshot = props.model.snapshot;
  const [correcting, setCorrecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [contactError, setContactError] = useState(false);
  const ended = snapshot.phase === "COMPLETED" || snapshot.phase === "CANCELLED";
  // Preview-only adapters omit pickup. The connected demo supports confirmed
  // pickup corrections even when its route provider is simulated.
  const locationWorkflowAvailable = !snapshot.synthetic || Boolean(snapshot.location.confirmedPickup);
  const showForm = locationWorkflowAvailable && (snapshot.permissions.canConfirmLocation || correcting);
  const title = translate(props.lang, snapshot.statusKey as keyof Translation);
  const explanation = explanationText(props.lang, snapshot.explanationKey, snapshot.statusExplanation);

  return (
    <div className="space-y-4" data-synthetic={snapshot.synthetic ? "true" : "false"}>
      {snapshot.synthetic || snapshot.eta?.demonstration ? (
        <p data-testid="demo-banner" className="rounded-2xl bg-alertbg px-4 py-3 text-sm font-semibold leading-6 text-alert">
          {translate(props.lang, "demoBanner")}
        </p>
      ) : null}
      {props.model.connection === "reconnecting" ? (
        <p role="status" className="rounded-2xl bg-white px-4 py-3 text-ink">
          {translate(props.lang, "reconnecting")}
        </p>
      ) : null}
      {props.model.needsResync ? <p role="status">{translate(props.lang, "refreshStatus")}</p> : null}
      <section className="card space-y-3" aria-live="polite">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">
          {translate(props.lang, "missionRef")} {snapshot.missionReference}
        </p>
        <h2 data-testid="status-title" className="text-3xl font-semibold leading-tight text-ink">
          {title}
        </h2>
        {explanation ? <p className="text-lg text-muted">{explanation}</p> : null}
        <AssignmentNotice ambulanceId={snapshot.assignment?.ambulanceId ?? null} label={translate(props.lang, "assignedChanged")} />
        <HospitalNotice hospitalId={snapshot.hospital?.hospitalId ?? null} label={translate(props.lang, "hospitalChanged")} />
        <EtaBlock lang={props.lang} snapshot={snapshot} />
        {snapshot.assignment ? (
          <p data-testid="ambulance-label" className="text-lg">
            {translate(props.lang, "ambulance")}: {snapshot.assignment.unitLabel} · {snapshot.assignment.vehicleType} ·{" "}
            {snapshot.assignment.registrationLabel}
          </p>
        ) : null}
        {snapshot.assignment && !snapshot.telemetry && !ended ? <p>{translate(props.lang, "positionPending")}</p> : null}
        {snapshot.hospital ? (
          <p>
            {translate(props.lang, "hospital")}: {snapshot.hospital.name}
          </p>
        ) : snapshot.phase === "AMBULANCE_ASSIGNED" || snapshot.phase === "AMBULANCE_APPROACHING" ? (
          <p>{translate(props.lang, "hospitalPending")}</p>
        ) : null}
        {snapshot.location.confirmedPickup ? (
          <p>
            {translate(props.lang, "pickupConfirmed")}
            {snapshot.location.confirmedPickup.addressFormatted ? ` · ${snapshot.location.confirmedPickup.addressFormatted}` : ""}
          </p>
        ) : null}
        {snapshot.location.correction?.alertedDriver ? <p>{translate(props.lang, "correctionSentBoth")}</p> : null}
        {snapshot.location.correction && !snapshot.location.correction.alertedDriver && snapshot.location.correction.alertedControlRoom ? (
          <p>{translate(props.lang, "correctionSentControl")}</p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        {ended && snapshot.phase === "COMPLETED" ? (
          <p>{translate(props.lang, "completedHint", { time: formatLocalTime(snapshot.accessExpiresAt, props.lang) })}</p>
        ) : null}
      </section>
      {!ended && !showForm ? (
        snapshot.synthetic && !snapshot.location.confirmedPickup ? <DemoLocationNotice lang={props.lang} /> : null
      ) : null}
      {!ended && !showForm ? (
        <TrackingMap
          lang={props.lang}
          pickup={snapshot.location.confirmedPickup}
          device={null}
          telemetry={snapshot.telemetry}
          synthetic={snapshot.synthetic}
          hospital={snapshot.hospital}
          route={snapshot.route?.points ?? null}
          accuracyMeters={snapshot.location.confirmedPickup?.accuracyMeters ?? null}
        />
      ) : null}
      {showForm ? (
        <section className="card">
          <LocationForm
            lang={props.lang}
            mode={snapshot.permissions.canConfirmLocation ? "confirm" : "correct"}
            dispatchStarted={snapshot.assignment !== null}
            expectedLocationVersion={snapshot.versions.location}
            initialPickup={snapshot.location.confirmedPickup}
            onSearch={props.onSearch}
            onReverse={props.onReverse}
            onSubmit={async (body) => {
              const alerts = await props.onSubmitLocation(body);
              setCorrecting(false);
              if (alerts.controlRoom && alerts.driver) setNotice(translate(props.lang, "correctionSentBoth"));
              else if (alerts.controlRoom) setNotice(translate(props.lang, "correctionSentControl"));
            }}
          />
        </section>
      ) : null}
      <div className="grid gap-3">
        {snapshot.permissions.canContactControlRoom ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setContactError(false);
              void props.onContact("control-room").catch(() => setContactError(true));
            }}
          >
            {translate(props.lang, "contactControl")}
          </button>
        ) : null}
        {snapshot.permissions.canContactDriver ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setContactError(false);
              void props.onContact("driver").catch(() => setContactError(true));
            }}
          >
            {translate(props.lang, "contactDriver")}
          </button>
        ) : null}
        {locationWorkflowAvailable && snapshot.permissions.canCorrectLocation && !correcting && !ended ? (
          <button type="button" className="btn btn-secondary" onClick={() => setCorrecting(true)}>
            {translate(props.lang, "correctAction")}
          </button>
        ) : null}
      </div>
      {contactError ? <p className="text-alert">{translate(props.lang, "callFailed")}</p> : null}
      <p className="text-sm text-muted">{translate(props.lang, "noClinical")}</p>
      {snapshot.synthetic ? (
        <details className="rounded-2xl border border-alert bg-alertbg p-3 text-alert">
          <summary className="cursor-pointer text-base font-semibold">{translate(props.lang, "demoControls")}</summary>
          <div className="mt-3 grid gap-2">
            {DEMO_ACTIONS.map((action) => (
              <button key={action.step} type="button" className="btn btn-secondary" onClick={() => void props.onDemoStep(action.step)}>
                {translate(props.lang, action.label)}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function DemoLocationNotice({ lang }: { lang: Lang }) {
  const whatsappUrl = import.meta.env.VITE_WHATSAPP_LANDING_URL || "https://wa.me/";
  return (
    <section className="card space-y-3" data-testid="demo-location-notice">
      <h3 className="text-lg font-semibold text-ink">{translate(lang, "demoLocationTitle")}</h3>
      <p className="text-muted">{translate(lang, "demoLocationBody")}</p>
      <a className="btn btn-primary inline-flex" href={whatsappUrl}>
        {translate(lang, "openWhatsApp")}
      </a>
    </section>
  );
}

function EtaBlock(props: { lang: Lang; snapshot: TrackingSnapshot }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const telemetry = props.snapshot.telemetry;
  const stale = telemetry
    ? isObservationStale(telemetry.observedAt, telemetry.staleAfterSeconds, now, telemetry.stale)
    : false;
  const updated = telemetry?.observedAt ?? props.snapshot.updatedAt;
  if (stale) {
    return (
      <div data-testid="eta">
        <p className="text-2xl font-semibold text-alert">{translate(props.lang, "lastKnown", { time: formatLocalTime(updated, props.lang) })}</p>
        <p>{translate(props.lang, "etaPaused")}</p>
        <p className="text-sm text-muted">{translate(props.lang, "staleNote")}</p>
      </div>
    );
  }
  const eta = props.snapshot.eta;
  const showArrival = eta && (props.snapshot.phase === "AMBULANCE_APPROACHING" || props.snapshot.phase === "TRAVELLING_TO_HOSPITAL");
  if (!showArrival || !eta) {
    return (
      <div data-testid="eta">
        <p className="text-lg text-muted">{translate(props.lang, "etaNone")}</p>
        <p className="text-sm text-muted">{translate(props.lang, "updated", { time: formatLocalTime(updated, props.lang) })}</p>
      </div>
    );
  }
  const minutes = minutesUntil(eta.estimatedArrivalAt, now);
  const demonstration = eta.demonstration || props.snapshot.synthetic;
  return (
    <div data-testid="eta">
      <p className={`text-sm font-semibold uppercase tracking-wide ${demonstration ? "text-alert" : "text-pine"}`}>
        {translate(props.lang, demonstration ? "etaDemo" : "etaLabel")}
      </p>
      <p className="text-5xl font-semibold tracking-tight text-ink">{translate(props.lang, "etaMinutes", { count: minutes ?? 0 })}</p>
      <p className="text-sm text-muted">{translate(props.lang, "updated", { time: formatLocalTime(updated, props.lang) })}</p>
    </div>
  );
}

function AssignmentNotice(props: { ambulanceId: string | null; label: string }) {
  const previous = useRef(props.ambulanceId);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (previous.current && props.ambulanceId && previous.current !== props.ambulanceId) setChanged(true);
    previous.current = props.ambulanceId;
  }, [props.ambulanceId]);
  if (!changed) return null;
  return (
    <p role="status" data-testid="assignment-changed">
      {props.label}
    </p>
  );
}

function HospitalNotice(props: { hospitalId: string | null; label: string }) {
  const previous = useRef(props.hospitalId);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (previous.current && props.hospitalId && previous.current !== props.hospitalId) setChanged(true);
    previous.current = props.hospitalId;
  }, [props.hospitalId]);
  if (!changed) return null;
  return <p role="status">{props.label}</p>;
}

function ErrorState(props: { lang: Lang; code: string; onRetry: () => void }) {
  const key =
    props.code === "TOKEN_EXPIRED" || props.code === "SESSION_EXPIRED"
      ? "status.expired"
      : props.code === "TOKEN_REVOKED"
        ? "status.revoked"
        : props.code === "CROSS_MISSION_DENIED"
          ? "status.crossMission"
          : props.code === "DEMO_DISABLED"
            ? "status.demoDisabled"
            : props.code === "TOKEN_INVALID"
              ? "status.invalid"
              : "status.unavailable";
  const terminal = props.code === "TOKEN_EXPIRED" || props.code === "TOKEN_INVALID" || props.code === "TOKEN_REVOKED" || props.code === "SESSION_EXPIRED" || props.code === "CROSS_MISSION_DENIED";
  return (
    <section className="card space-y-4" data-testid="error-state">
      <h2 className="text-3xl font-semibold text-ink">{translate(props.lang, key)}</h2>
      {props.code === "SESSION_EXPIRED" ? <p>{translate(props.lang, "status.sessionExpired")}</p> : null}
      <p>{translate(props.lang, "helpEmergency")}</p>
      {!terminal ? (
        <button type="button" className="btn btn-primary" onClick={props.onRetry}>
          {translate(props.lang, "retry")}
        </button>
      ) : null}
    </section>
  );
}
