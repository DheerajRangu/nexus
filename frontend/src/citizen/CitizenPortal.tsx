import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Ambulance,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Cross,
  HeartPulse,
  LocateFixed,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { App as CitizenTracking } from "../../../src/App";
import { TrackingMap } from "../../../src/map/TrackingMap";
import { core } from "../services/ecosystem";
import type { GeoPoint } from "../../../shared/contract";
import "./citizen.css";
const categories = [
  {
    id: "ROAD_ACCIDENT",
    title: "Road accident",
    description: "Collision or roadside injury",
    icon: Ambulance,
  },
  {
    id: "CARDIAC",
    title: "Heart emergency",
    description: "Suspected heart-related emergency",
    icon: HeartPulse,
  },
  {
    id: "BREATHING",
    title: "Breathing difficulty",
    description: "Urgent help with breathing",
    icon: Activity,
  },
  {
    id: "STROKE",
    title: "Suspected stroke",
    description: "A possible neurological emergency",
    icon: Stethoscope,
  },
  {
    id: "INJURY",
    title: "Serious injury",
    description: "Injury requiring emergency help",
    icon: Cross,
  },
  {
    id: "OTHER",
    title: "Something else",
    description: "Describe the emergency below",
    icon: Phone,
  },
];
export function CitizenPortal() {
  const token = useRef(
    location.pathname.startsWith("/emergency-track/")
      ? location.pathname.split("/").at(-1) || null
      : null,
  );
  const [tracking, setTracking] = useState(
      Boolean(token.current) || location.pathname === "/citizen/tracking",
    ),
    [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [category, setCategory] = useState("ROAD_ACCIDENT"),
    [reporter, setReporter] = useState("WITH_PATIENT"),
    [details, setDetails] = useState(""),
    [landmark, setLandmark] = useState(""),
    [pin, setPin] = useState<GeoPoint | null>(null),
    [device, setDevice] = useState<GeoPoint | null>(null),
    [gps, setGps] = useState(false),
    [accuracy, setAccuracy] = useState<number | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  const [coordinates, setCoordinates] = useState({
    latitude: "",
    longitude: "",
  });
  const submission = useRef(crypto.randomUUID()),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (token.current) history.replaceState({}, "", "/citizen/tracking");
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  function useGPS() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable on this device. Enter coordinates or place the pickup pin.",
      );
      return;
    }
    setGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!mounted.current) return;
        const point = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        };
        setDevice(point);
        setPin(point);
        setCoordinates({
          latitude: String(point.latitude),
          longitude: String(point.longitude),
        });
        setConfirmed(false);
        setAccuracy(p.coords.accuracy);
        setGps(false);
      },
      (e) => {
        if (!mounted.current) return;
        setGps(false);
        setError(
          e.code === 1
            ? "Location permission was denied. You can still choose the pickup point on the map or enter coordinates."
            : "Could not get your location. Choose the pickup point on the map or enter coordinates.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 },
    );
  }
  const movePin = (point: GeoPoint) => {
    setPin(point);
    setCoordinates({
      latitude: String(point.latitude),
      longitude: String(point.longitude),
    });
    setAccuracy(null);
    setConfirmed(false);
  };
  function editCoordinate(axis: "latitude" | "longitude", value: string) {
    const next = { ...coordinates, [axis]: value };
    setCoordinates(next);
    setConfirmed(false);
    setAccuracy(null);
    const lat = Number(next.latitude),
      lon = Number(next.longitude);
    setPin(
      next.latitude.trim() &&
        next.longitude.trim() &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
        ? { latitude: lat, longitude: lon }
        : null,
    );
  }
  async function submit() {
    if (!pin || !confirmed || busy) return;
    setError("");
    setBusy(true);
    try {
      const response = await core<{ incidentId: string; trackingLink: string }>(
        "/api/incidents",
        {
          submissionId: submission.current,
          patientName: name.trim() || "Emergency patient",
          phone: phone.trim(),
          location: pin,
          emergencyType: category,
          severity: "HIGH",
          description: [
            details.trim(),
            landmark.trim() && "Pickup landmark: " + landmark.trim(),
            reporter === "WITH_PATIENT"
              ? "Reporter is with patient"
              : "Reporter is at another location",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      );
      setLink(location.origin + response.trackingLink);
      setTracking(true);
      history.replaceState({}, "", "/citizen/tracking");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Tracking link copied. Share it only with people you trust.");
    } catch {
      setNotice("Copy is unavailable. Select and copy the link below.");
    }
  }
  async function share() {
    try {
      if (navigator.share)
        await navigator.share({ title: "AEGIS emergency tracking", url: link });
      else await copy();
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setNotice("Sharing failed. You can copy the tracking link instead.");
    }
  }
  const selected = categories.find((c) => c.id === category)!;
  return (
    <div className="cp-root">
      <header className="cp-header">
        <a href="/citizen" className="cp-brand">
          <span>
            <Cross size={22} />
          </span>
          <b>
            AEGIS<small>EMERGENCY SUPPORT</small>
          </b>
        </a>
        <nav>
          <span>
            <i /> CITIZEN PORTAL
          </span>
          <a href="tel:112">
            <Phone size={14} /> Call 112
          </a>
        </nav>
      </header>
      <div className="cp-demo-note">
        <ShieldCheck size={14} />
        <span>
          Demo environment. This app does not call or dispatch real emergency
          services.
        </span>
        <a href="tel:112">
          For real emergencies, call 112 <ArrowRight size={12} />
        </a>
      </div>
      {tracking ? (
        <main className="cp-tracking">
          <div className="cp-tracking-head">
            <div>
              <span className="cp-eyebrow">YOUR RESPONSE · LIVE UPDATES</span>
              <h1>Your emergency journey</h1>
              <p>
                Follow the assigned ambulance and hospital updates in one place.
              </p>
            </div>
            <a className="cp-secondary" href="/citizen">
              New demo request <ArrowRight size={15} />
            </a>
          </div>
          <div className="citizen-surface cp-tracking-surface">
            <CitizenTracking initialToken={token.current} startDemo={false} />
          </div>
          {link && (
            <section className="cp-share">
              <div>
                <Users size={22} />
                <h2>
                  Keep your people informed.
                  <small>
                    Share this restricted link with someone you trust.
                  </small>
                </h2>
              </div>
              <div>
                <button onClick={() => void share()}>
                  <Send size={15} /> Share tracking
                </button>
                <button onClick={() => void copy()}>
                  <Copy size={15} /> Copy link
                </button>
              </div>
              <input
                aria-label="Tracking link"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
              />
            </section>
          )}
        </main>
      ) : (
        <main className="cp-intake">
          <aside className="cp-intro">
            <span className="cp-eyebrow">
              <span /> HELP STARTS WITH A CLEAR REQUEST
            </span>
            <h1>
              Help is a<br />
              <em>step closer.</em>
            </h1>
            <p>
              Tell us what happened and where to find the patient. Follow the
              response as it happens.
            </p>
            <div className="cp-intro-visual">
              <div className="cp-orbit outer" />
              <div className="cp-orbit inner" />
              <div className="cp-ambulance">
                <Ambulance size={48} />
              </div>
              <div className="cp-visual-label">
                <i />
                <span>ONE REQUEST. ONE SHARED RESPONSE.</span>
              </div>
              <div className="cp-location-label">
                <MapPin size={12} /> Confirmed pickup
              </div>
              <div className="cp-hospital-label">
                <Cross size={12} /> Receiving hospital
              </div>
              <svg viewBox="0 0 350 230">
                <path
                  d="M40 175 C110 175 90 60 175 115 S265 45 310 55"
                  fill="none"
                  stroke="#41c9bb"
                  strokeWidth="1.5"
                  strokeDasharray="4 6"
                />
              </svg>
            </div>
            <div className="cp-expectations">
              {[
                [
                  MapPin,
                  "A clear pickup point",
                  "Confirm the patient’s location, not just your phone’s.",
                ],
                [
                  Ambulance,
                  "A connected response",
                  "Your request appears in the shared command room.",
                ],
                [
                  ShieldCheck,
                  "Private tracking",
                  "Share the restricted journey link with trusted people.",
                ],
              ].map(([Icon, title, description]) => {
                const I = Icon as typeof MapPin;
                return (
                  <div key={String(title)}>
                    <I size={18} />
                    <div>
                      <b>{String(title)}</b>
                      <small>{String(description)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
            <footer>
              <Phone size={14} />
              <span>Need real emergency help?</span>
              <a href="tel:112">
                Call 112 <ArrowRight size={12} />
              </a>
            </footer>
          </aside>
          <section className="cp-request">
            <div className="cp-request-top">
              <span className="cp-eyebrow">EMERGENCY REQUEST</span>
              <span>0{step + 1} / 03</span>
            </div>
            <div className="cp-steps">
              {["Emergency", "Pickup location", "Confirm"].map((s, i) => (
                <button
                  key={s}
                  disabled={i > step}
                  onClick={() => {
                    setStep(i);
                    setError("");
                  }}
                  className={i === step ? "current" : i < step ? "done" : ""}
                >
                  <span>{i < step ? <Check size={12} /> : i + 1}</span>
                  {s}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="cp-step-body"
              >
                {step === 0 ? (
                  <>
                    <h2>What happened?</h2>
                    <p>
                      Choose the closest match. The response team will assess
                      the situation.
                    </p>
                    <div
                      className="cp-categories"
                      role="group"
                      aria-label="Emergency type"
                    >
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          className={category === c.id ? "selected" : ""}
                          aria-pressed={category === c.id}
                          onClick={() => setCategory(c.id)}
                        >
                          <c.icon size={21} />
                          <span>
                            <b>{c.title}</b>
                            <small>{c.description}</small>
                          </span>
                          {category === c.id ? (
                            <Check size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="cp-fields">
                      <label>
                        Patient name <small>Optional</small>
                        <input
                          aria-label="Patient name"
                          autoComplete="name"
                          value={name}
                          maxLength={100}
                          placeholder="Who needs help?"
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <label>
                        Contact number <small>Optional</small>
                        <input
                          aria-label="Contact number"
                          type="tel"
                          autoComplete="tel"
                          value={phone}
                          maxLength={30}
                          placeholder="A number the team can use"
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="cp-description">
                      What should the team know? <small>Optional</small>
                      <textarea
                        aria-label="Emergency details"
                        value={details}
                        maxLength={1000}
                        rows={2}
                        placeholder="Briefly describe what happened…"
                        onChange={(e) => setDetails(e.target.value)}
                      />
                    </label>
                  </>
                ) : step === 1 ? (
                  <>
                    <h2>Where is the patient?</h2>
                    <p>
                      Choose the pickup point. You can use your location, move
                      the pin, or enter coordinates.
                    </p>
                    <div className="cp-reporter">
                      <label>
                        <input
                          type="radio"
                          name="reporter"
                          checked={reporter === "WITH_PATIENT"}
                          onChange={() => setReporter("WITH_PATIENT")}
                        />{" "}
                        I am with the patient
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="reporter"
                          checked={reporter === "REPORTING_OTHER_LOCATION"}
                          onChange={() =>
                            setReporter("REPORTING_OTHER_LOCATION")
                          }
                        />{" "}
                        I am reporting another location
                      </label>
                    </div>
                    <button className="cp-gps" disabled={gps} onClick={useGPS}>
                      <LocateFixed size={19} />
                      <span>
                        {gps
                          ? "Finding your location…"
                          : "Use my current location"}
                        <small>
                          {reporter === "REPORTING_OTHER_LOCATION"
                            ? "Then move the pin to the patient’s location"
                            : "Your browser will ask for permission"}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <div className="cp-pickup-map">
                      <TrackingMap
                        lang="en"
                        pickup={pin ? { ...pin, draggable: true } : null}
                        device={device}
                        telemetry={null}
                        synthetic
                        showProviderHint={false}
                        hospital={null}
                        route={null}
                        accuracyMeters={accuracy}
                        onPickupChange={movePin}
                      />
                    </div>
                    <div className="cp-pin-status">
                      <MapPin size={13} />
                      {pin
                        ? `Pickup selected · ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`
                        : "Select a pickup point before continuing"}
                      {accuracy != null && (
                        <small>GPS accuracy ±{Math.round(accuracy)} m</small>
                      )}
                    </div>
                    <details className="cp-manual">
                      <summary>Enter exact coordinates</summary>
                      <div className="cp-fields">
                        <label>
                          Latitude
                          <input
                            aria-label="Latitude"
                            type="number"
                            min={-90}
                            max={90}
                            step="any"
                            value={coordinates.latitude}
                            onChange={(e) =>
                              editCoordinate("latitude", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          Longitude
                          <input
                            aria-label="Longitude"
                            type="number"
                            min={-180}
                            max={180}
                            step="any"
                            value={coordinates.longitude}
                            onChange={(e) =>
                              editCoordinate("longitude", e.target.value)
                            }
                          />
                        </label>
                      </div>
                    </details>
                    <label className="cp-description">
                      Landmark or access instructions <small>Optional</small>
                      <input
                        aria-label="Pickup landmark"
                        value={landmark}
                        maxLength={500}
                        placeholder="Building, gate, floor, or nearby landmark"
                        onChange={(e) => setLandmark(e.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <h2>Check the request.</h2>
                    <p>
                      Make sure the pickup point belongs to the patient before
                      sharing it.
                    </p>
                    <div className="cp-review">
                      <div>
                        <selected.icon size={25} />
                        <span>
                          <small>EMERGENCY</small>
                          <b>{selected.title}</b>
                        </span>
                        <button
                          title="Edit emergency"
                          onClick={() => setStep(0)}
                        >
                          Edit
                        </button>
                      </div>
                      <div>
                        <Users size={23} />
                        <span>
                          <small>PATIENT</small>
                          <b>{name.trim() || "Emergency patient"}</b>
                          <p>{phone || "No contact number provided"}</p>
                        </span>
                      </div>
                      <div>
                        <MapPin size={24} />
                        <span>
                          <small>PICKUP POINT</small>
                          <b>
                            {pin?.latitude.toFixed(5)},{" "}
                            {pin?.longitude.toFixed(5)}
                          </b>
                          <p>{landmark || "No additional landmark"}</p>
                        </span>
                        <button
                          title="Edit pickup location"
                          onClick={() => setStep(1)}
                        >
                          Edit
                        </button>
                      </div>
                      {details && <p>{details}</p>}
                    </div>
                    <label className="cp-confirm">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      <span>
                        I confirm this is the patient’s pickup location.
                        <small>
                          The request will be sent to the AEGIS demo command
                          room.
                        </small>
                      </span>
                    </label>
                    <div className="cp-privacy">
                      <ShieldCheck size={17} />
                      <p>
                        Tracking access is restricted to this emergency. Share
                        the journey link only with trusted people.
                      </p>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            {error && (
              <div className="cp-error" role="alert">
                {error}
              </div>
            )}
            <div className="cp-step-actions">
              {step > 0 ? (
                <button
                  className="cp-back"
                  disabled={busy}
                  onClick={() => {
                    setStep(step - 1);
                    setError("");
                  }}
                >
                  <ArrowLeft size={14} /> Back
                </button>
              ) : (
                <small>No account needed.</small>
              )}
              <button
                className="cp-primary"
                disabled={
                  busy ||
                  (step === 1 &&
                    (!pin ||
                      !Number.isFinite(pin.latitude) ||
                      !Number.isFinite(pin.longitude) ||
                      Math.abs(pin.latitude) > 90 ||
                      Math.abs(pin.longitude) > 180)) ||
                  (step === 2 && !confirmed)
                }
                onClick={() => {
                  setError("");
                  if (step < 2) setStep(step + 1);
                  else void submit();
                }}
              >
                {step === 2
                  ? busy
                    ? "Sending request…"
                    : "Send demo emergency request"
                  : "Continue"}
                {step === 2 ? <Send size={16} /> : <ArrowRight size={16} />}
              </button>
            </div>
            <div className="cp-card-footer">
              <ShieldCheck size={12} /> Your location is shared only after you
              confirm.
            </div>
          </section>
        </main>
      )}
      <footer className="cp-footer">
        <span>AEGIS · Connected emergency response</span>
        <span>Citizen support · India</span>
      </footer>
      <AnimatePresence>
        {notice && (
          <motion.div
            className="cp-toast"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
          >
            <CheckCheck size={17} />
            {notice}
            <button title="Dismiss" onClick={() => setNotice("")}>
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
