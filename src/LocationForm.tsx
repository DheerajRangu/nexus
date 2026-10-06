import { useState, type FormEvent } from "react";
import type { ConfirmedPickup, GeoPoint, Lang, LocationConfirmationRequest, PlaceResult, ReporterRole } from "../shared/contract";
import { translate } from "./i18n";
import { TrackingMap } from "./map/TrackingMap";

type PinSource = "gps" | "drag" | "search" | "manual";

interface Pin extends GeoPoint {
  source: PinSource;
  accuracyMeters: number | null;
  observedAt: string;
}

interface DeviceFix extends GeoPoint {
  accuracyMeters: number | null;
  observedAt: string;
}

export function LocationForm(props: {
  lang: Lang;
  mode: "confirm" | "correct";
  dispatchStarted: boolean;
  expectedLocationVersion: number;
  initialPickup?: ConfirmedPickup | null;
  onSubmit: (body: LocationConfirmationRequest) => Promise<void>;
  onSearch: (query: string) => Promise<{ results: PlaceResult[]; syntheticAddress: boolean }>;
  onReverse: (point: GeoPoint) => Promise<{ result: PlaceResult | null; syntheticAddress: boolean }>;
}) {
  const [role, setRole] = useState<ReporterRole | null>(props.initialPickup?.role ?? null);
  const [pin, setPin] = useState<Pin | null>(
    props.initialPickup
      ? {
          latitude: props.initialPickup.latitude,
          longitude: props.initialPickup.longitude,
          source: "drag",
          accuracyMeters: null,
          observedAt: new Date().toISOString(),
        }
      : null,
  );
  const [device, setDevice] = useState<DeviceFix | null>(null);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "unavailable">("unknown");
  const [address, setAddress] = useState(props.initialPickup?.addressFormatted ?? "");
  const [syntheticAddress, setSyntheticAddress] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [notes, setNotes] = useState({
    landmark: props.initialPickup?.notes.landmark ?? "",
    floor: props.initialPickup?.notes.floor ?? "",
    building: props.initialPickup?.notes.building ?? "",
    gate: props.initialPickup?.notes.gate ?? "",
    access: props.initialPickup?.notes.access ?? "",
  });
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function shareDevice() {
    if (!navigator.geolocation) {
      setPermission("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const fix: DeviceFix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          observedAt: new Date(position.timestamp).toISOString(),
        };
        setDevice(fix);
        setPermission("granted");
        setPin({ ...fix, source: "gps" });
        void props.onReverse(fix).then((found) => {
          if (!found.result) return;
          setAddress(found.result.label);
          setSyntheticAddress(found.syntheticAddress);
        });
      },
      (error) => {
        setPermission(error.code === 1 ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }

  async function search() {
    const found = await props.onSearch(address);
    setResults(found.results);
    setSyntheticAddress(found.syntheticAddress);
  }

  function chooseResult(result: PlaceResult) {
    setPin({
      latitude: result.latitude,
      longitude: result.longitude,
      source: "search",
      accuracyMeters: null,
      observedAt: new Date().toISOString(),
    });
    setAddress(result.label);
    setResults([]);
  }

  function movePin(point: GeoPoint) {
    setPin({
      latitude: point.latitude,
      longitude: point.longitude,
      source: pin?.source === "manual" ? "manual" : "drag",
      accuracyMeters: null,
      observedAt: new Date().toISOString(),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!role) {
      setHint(translate(props.lang, "chooseRole"));
      return;
    }
    if (!pin) {
      setHint(translate(props.lang, "placePin"));
      return;
    }
    if (!checked) {
      setHint(translate(props.lang, "confirmBox"));
      return;
    }
    setHint(null);
    setSubmitting(true);
    const source =
      pin.source === "gps" ? "BROWSER_GPS" : pin.source === "search" ? "ADDRESS_SEARCH" : pin.source === "manual" ? "MANUAL_ENTRY" : "MANUAL_PIN";
    try {
      await props.onSubmit({
        clientSubmissionId: crypto.randomUUID(),
        expectedLocationVersion: props.expectedLocationVersion,
        role,
        confirmed: true,
        pickup: {
          latitude: pin.latitude,
          longitude: pin.longitude,
          accuracyMeters: source === "BROWSER_GPS" ? pin.accuracyMeters : null,
          observedAt: pin.observedAt,
          source,
        },
        deviceObservation: device
          ? {
              latitude: device.latitude,
              longitude: device.longitude,
              accuracyMeters: device.accuracyMeters,
              observedAt: device.observedAt,
              source: "BROWSER_GPS",
            }
          : null,
        addressFormatted: address.trim() || null,
        notes: {
          landmark: notes.landmark.trim() || null,
          floor: notes.floor.trim() || null,
          building: notes.building.trim() || null,
          gate: notes.gate.trim() || null,
          access: notes.access.trim() || null,
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  const ready = Boolean(role && pin && checked && !submitting);

  return (
    <form data-testid="location-form" className="space-y-4" onSubmit={submit}>
      <p className="text-lg text-ink">{translate(props.lang, "locationLead")}</p>
      <button type="button" className="btn btn-secondary" onClick={() => void shareDevice()}>
        {translate(props.lang, "locationDevice")}
      </button>
      {permission === "denied" ? <p className="rounded-xl bg-alertbg px-3 py-2 text-alert">{translate(props.lang, "locationDenied")}</p> : null}
      {permission === "unavailable" ? (
        <p className="rounded-xl bg-alertbg px-3 py-2 text-alert">{translate(props.lang, "locationUnavailable")}</p>
      ) : null}
      <TrackingMap
        lang={props.lang}
        pickup={pin ? { ...pin, draggable: true } : null}
        device={device}
        telemetry={null}
        synthetic
        hospital={null}
        route={null}
        accuracyMeters={pin?.source === "gps" ? pin.accuracyMeters : null}
        onPickupChange={movePin}
      />
      <p className="text-sm text-muted">{translate(props.lang, "pinHelp")}</p>
      {role === "REPORTING_OTHER_LOCATION" ? <p className="text-sm text-ink">{translate(props.lang, "reportingOtherHint")}</p> : null}
      <fieldset className="space-y-2">
        <RoleButton lang={props.lang} value="WITH_PATIENT" current={role} onChange={setRole} labelKey="withPatient" />
        <RoleButton lang={props.lang} value="REPORTING_OTHER_LOCATION" current={role} onChange={setRole} labelKey="reportingOther" />
      </fieldset>
      <div>
        <label className="text-sm font-semibold" htmlFor="address-search">
          {translate(props.lang, "searchLabel")}
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="address-search"
            className="field min-w-0 flex-1"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <button type="button" className="btn btn-secondary px-4" onClick={() => void search()}>
            {translate(props.lang, "searchAction")}
          </button>
        </div>
        {syntheticAddress ? <p className="mt-1 text-sm text-alert">{translate(props.lang, "syntheticAddress")}</p> : null}
        <ul className="mt-2 space-y-2">
          {results.map((result) => (
            <li key={`${result.latitude}-${result.longitude}-${result.label}`}>
              <button type="button" className="btn btn-secondary text-left" onClick={() => chooseResult(result)}>
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          id="latitude"
          label={translate(props.lang, "lat")}
          value={pin?.latitude ?? ""}
          onChange={(latitude) =>
            setPin({
              latitude,
              longitude: pin?.longitude ?? 78.486671,
              source: "manual",
              accuracyMeters: null,
              observedAt: new Date().toISOString(),
            })
          }
        />
        <NumberField
          id="longitude"
          label={translate(props.lang, "lng")}
          value={pin?.longitude ?? ""}
          onChange={(longitude) =>
            setPin({
              latitude: pin?.latitude ?? 17.385044,
              longitude,
              source: "manual",
              accuracyMeters: null,
              observedAt: new Date().toISOString(),
            })
          }
        />
      </div>
      {pin?.source === "gps" && pin.accuracyMeters != null ? (
        <p className="text-sm text-muted">{translate(props.lang, "accuracy", { meters: Math.round(pin.accuracyMeters) })}</p>
      ) : null}
      {address ? (
        <p className="text-sm text-ink">
          {translate(props.lang, "addressSuggestion")}: {address}
        </p>
      ) : null}
      <div className="grid gap-3">
        <NoteField id="landmark" label={translate(props.lang, "landmark")} value={notes.landmark} onChange={(landmark) => setNotes({ ...notes, landmark })} />
        <NoteField id="floor" label={translate(props.lang, "floor")} value={notes.floor} onChange={(floor) => setNotes({ ...notes, floor })} />
        <NoteField id="building" label={translate(props.lang, "building")} value={notes.building} onChange={(building) => setNotes({ ...notes, building })} />
        <NoteField id="gate" label={translate(props.lang, "gate")} value={notes.gate} onChange={(gate) => setNotes({ ...notes, gate })} />
        <NoteField id="access" label={translate(props.lang, "access")} value={notes.access} onChange={(access) => setNotes({ ...notes, access })} />
      </div>
      {props.mode === "correct" ? (
        <p className="rounded-xl bg-alertbg px-3 py-3 text-alert" data-testid="correction-warning">
          {props.dispatchStarted ? translate(props.lang, "correctWarning") : translate(props.lang, "correctBeforeDispatch")}
        </p>
      ) : null}
      <label className="flex min-h-12 items-start gap-3 text-base">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>{translate(props.lang, props.mode === "correct" ? "correctCheck" : "confirmCheck")}</span>
      </label>
      {hint ? <p className="text-alert">{hint}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {submitting
          ? translate(props.lang, "sending")
          : translate(props.lang, props.mode === "correct" ? "correctAction" : "confirmAction")}
      </button>
    </form>
  );
}

function RoleButton(props: {
  lang: Lang;
  value: ReporterRole;
  current: ReporterRole | null;
  onChange: (role: ReporterRole) => void;
  labelKey: "withPatient" | "reportingOther";
}) {
  const selected = props.current === props.value;
  return (
    <label className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 ${selected ? "border-teal bg-mist" : "border-line bg-white"}`}>
      <input type="radio" name="reporter-role" checked={selected} onChange={() => props.onChange(props.value)} />
      <span className="text-base font-semibold">{translate(props.lang, props.labelKey)}</span>
    </label>
  );
}

function NumberField(props: { id: string; label: string; value: number | ""; onChange: (value: number) => void }) {
  return (
    <label className="text-sm font-semibold" htmlFor={props.id}>
      {props.label}
      <input
        id={props.id}
        className="field"
        inputMode="decimal"
        value={props.value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) props.onChange(next);
        }}
      />
    </label>
  );
}

function NoteField(props: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold" htmlFor={props.id}>
      {props.label}
      <input id={props.id} className="field" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}
