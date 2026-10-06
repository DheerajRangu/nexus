import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Ambulance,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  Command,
  Cross,
  HeartPulse,
  Hospital,
  Layers,
  LockKeyhole,
  Maximize,
  MessageSquare,
  Pause,
  Play,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Siren,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  core,
  type City,
  type Incident,
  type Operator,
} from "../services/ecosystem";
import { useHospitalStore } from "../stores/hospital";
import {
  HospitalSimulationEngine,
  hospitalDemoStages,
} from "../simulation/HospitalSimulationEngine";
import { HospitalMap } from "./HospitalMap";
import type { HospitalOperations, Preparation } from "./types";
import "./hospital.css";
const STAFF_ROLES = [
  "COMMANDER",
  "EMERGENCY_PHYSICIAN",
  "TRAUMA_LEAD",
  "NURSE_COORDINATOR",
  "RESOURCE_COORDINATOR",
  "RADIOLOGY",
  "BLOOD_BANK",
  "ADMIN",
  "VIEWER",
];
const TABS = [
  "Receiving",
  "Resources",
  "Teams",
  "Patient board",
  "Command link",
  "Analytics",
  "Policies",
  "System health",
  "Audit",
];
const CHECKS = [
  "Patient received",
  "Vitals confirmed",
  "Belongings received",
  "Documentation received",
  "Medication history reviewed",
];
const label = (s: string) => s.replaceAll("_", " ");
const time = (n: number) =>
  `${Math.floor(Math.max(0, n) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, n) % 60)
    .toString()
    .padStart(2, "0")}`;
const clock = (s: string) =>
  new Date(s).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });
const priority = (i: Incident) =>
  i.severity === "CRITICAL" ? "P1" : i.severity === "HIGH" ? "P2" : "P3";
const initials = (s: string) =>
  s
    .split(" ")
    .filter((p) => p !== "Dr.")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
function Panel({
  title,
  kicker,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"hc-panel " + className}>
      <div className="hc-panel-heading">
        <div>
          {kicker && <small>{kicker}</small>}
          <h2>{title}</h2>
        </div>
        <span className="hc-live-dot" />
      </div>
      {children}
    </section>
  );
}
function Chip({
  children,
  tone = "cyan",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"hc-chip " + tone}>{children}</span>;
}
function Gauge({
  value,
  title,
  size = 150,
}: {
  value: number;
  title: string;
  size?: number;
}) {
  const r = 56,
    c = 2 * Math.PI * r;
  return (
    <div className="hc-gauge" style={{ width: size }}>
      <svg viewBox="0 0 140 140">
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#1b2b38"
          strokeWidth="7"
        />
        <motion.circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={value < 50 ? "#fb6675" : value < 85 ? "#eebc66" : "#46e6b4"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1 }}
          transform="rotate(-90 70 70)"
        />
        <circle
          cx="70"
          cy="70"
          r="45"
          fill="none"
          stroke="#17302e"
          strokeDasharray="1 6"
        />
      </svg>
      <div>
        <strong>
          {value}
          <em>%</em>
        </strong>
        <small>{title}</small>
      </div>
    </div>
  );
}
function Waveforms({ incident, demo }: { incident: Incident; demo: boolean }) {
  const hr = Number(incident.vitals.hr || incident.vitals.heartRate || 0);
  const points = useMemo(
    () =>
      Array.from({ length: 180 }, (_, j) => {
        const p = j % 30;
        return `${j * 4},${36 + (p === 12 ? -4 : p === 13 ? -30 : p === 14 ? 22 : p === 15 ? -10 : Math.sin(j * 0.6) * 2)}`;
      }).join(" "),
    [],
  );
  return (
    <div className={"hc-waveforms " + (incident.deteriorating ? "danger" : "")}>
      <div className="hc-wave-head">
        <HeartPulse size={14} /> LIVE VITALS{" "}
        <span>
          {demo
            ? "DEMO GENERATED TRACES"
            : "REPORTED VALUES · NO LIVE ECG DEVICE"}
        </span>
      </div>
      <div className="hc-wave-main">
        <strong>
          {hr || "—"}
          <small>HR / MIN</small>
        </strong>
        {demo ? (
          <div className="hc-trace">
            <svg viewBox="0 0 360 70">
              <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </div>
        ) : (
          <p>Awaiting connected monitor trace</p>
        )}
      </div>
      <div className="hc-vitals">
        {[
          ["BP", incident.vitals.bp || "—", "mmHg"],
          ["SpO₂", incident.vitals.spo2 || "—", "%"],
          ["RR", incident.vitals.rr || "—", "/min"],
          ["GCS", incident.vitals.gcs || "—", "/15"],
        ].map(([name, value, unit]) => (
          <div key={name}>
            <small>{name}</small>
            <motion.b
              key={String(value)}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
            >
              {value}
              <em>{unit}</em>
            </motion.b>
            {demo && (
              <svg viewBox="0 0 100 15">
                <path
                  d={
                    name === "SpO₂"
                      ? "M0 10 Q10 -3 20 10 T40 10 T60 10 T80 10 T100 10"
                      : "M0 10 Q15 -2 30 10 T60 10 T90 10"
                  }
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
function HospitalLogin({ onLogin }: { onLogin: () => void }) {
  const resources = useQuery({
    queryKey: ["hospital-demo-resources"],
    queryFn: () =>
      core<{ hospitals: { id: string; name: string }[] }>(
        "/api/demo/resources",
      ),
    retry: false,
  });
  const [hid, setHid] = useState("HOSP-B"),
    [role, setRole] = useState("COMMANDER"),
    [key, setKey] = useState("");
  useEffect(() => {
    const h = resources.data?.hospitals;
    if (h?.length && !h.some((x) => x.id === hid)) setHid(h[0].id);
  }, [resources.data, hid]);
  const bootstrap = useMutation({
    mutationFn: () => core("/api/hospital-command/bootstrap", {}),
    onSuccess: () => resources.refetch(),
  });
  const login = useMutation({
    mutationFn: () =>
      core("/api/hospital-command/session", {
        resourceId: hid,
        staffRole: role,
        key,
      }),
    onSuccess: onLogin,
  });
  return (
    <div className="hc-login">
      <div className="hc-login-grid" />
      <div className="hc-login-brand">
        <Cross size={28} />
        <span>
          AEGIS <b>HOSPITAL COMMAND</b>
        </span>
        <Chip tone="green">EMERGENCY RECEIVING NETWORK</Chip>
      </div>
      <main>
        <div className="hc-login-orbit">
          <Cross size={46} />
        </div>
        <small>PREPARE BEFORE ARRIVAL</small>
        <h1>
          Every second.
          <br />
          <span>Every life.</span>
        </h1>
        <p>
          A dedicated receiving center for incoming emergencies, team
          preparation and coordinated patient handover.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          {resources.data?.hospitals.length === 0 && (
            <button
              type="button"
              disabled={bootstrap.isPending}
              onClick={() => bootstrap.mutate()}
            >
              Initialize hospital demo network
            </button>
          )}
          {bootstrap.error && (
            <p className="hc-error">{bootstrap.error.message}</p>
          )}
          <label>
            Receiving hospital
            {resources.data ? (
              <select value={hid} onChange={(e) => setHid(e.target.value)}>
                {resources.data.hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.id}
                  </option>
                ))}
              </select>
            ) : (
              <input value={hid} onChange={(e) => setHid(e.target.value)} />
            )}
          </label>
          <label>
            Hospital staff role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {STAFF_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Operator key <small>Required when demo access is disabled</small>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="hc-primary" disabled={login.isPending}>
            Enter hospital command <ArrowRight size={16} />
          </button>
          {login.error && <p className="hc-error">{login.error.message}</p>}
        </form>
        <footer>
          Connected emergency state · Secure role scope · Demo resources labeled
        </footer>
      </main>
      <aside>
        <div className="hc-login-line" />
        <HeartPulse size={20} /> RECEIVING CENTER ONLINE{" "}
        <div className="hc-login-line" />
      </aside>
    </div>
  );
}
export function HospitalCommand() {
  const cache = useQueryClient(),
    store = useHospitalStore(),
    { city, operations: ops, selected, tab } = store;
  const session = useQuery({
    queryKey: ["hospital-session"],
    queryFn: () =>
      core<{ state: City; user: Operator }>("/api/ecosystem/state"),
    retry: false,
  });
  const authorized = session.data?.user.role === "HOSPITAL_OPERATOR",
    hid = authorized ? session.data!.user.resourceId || "" : "";
  const [staffRole, setStaffRole] = useState("COMMANDER"),
    [connected, setConnected] = useState(false),
    [stamp, setStamp] = useState(Date.now()),
    [sound, setSound] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [alertsOpen, setAlertsOpen] = useState(false),
    [toast, setToast] = useState(""),
    [expanded, setExpanded] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    lastAlert = useRef("");
  const opQuery = useQuery({
    queryKey: ["hospital-operations", hid],
    queryFn: () =>
      core<{ operations: HospitalOperations; staffRole: string }>(
        `/api/hospital-command/${hid}`,
      ),
    enabled: !!hid,
    retry: false,
  });
  useEffect(() => {
    if (opQuery.data) setStaffRole(opQuery.data.staffRole);
  }, [opQuery.data]);
  const refresh = async () => {
    const data = await core<{ state: City }>("/api/ecosystem/state");
    if (hid) store.setSnapshot(data.state, hid);
  };
  useEffect(() => {
    if (session.data && hid) store.setSnapshot(session.data.state, hid);
  }, [session.data, hid]);
  useEffect(() => {
    if (opQuery.data) void refresh();
  }, [opQuery.data]);
  useEffect(() => {
    if (!hid) return;
    let stopped = false,
      socket: WebSocket | null = null,
      timer: ReturnType<typeof setTimeout>;
    const open = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/command`,
      );
      socket.onopen = () => setConnected(true);
      socket.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p.type === "state") store.setSnapshot(p.state, hid);
        } catch {
          /* invalid packet ignored */
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(open, 2000);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [hid]);
  useEffect(() => {
    const t = setInterval(() => setStamp(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setAlertsOpen(false);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const action = useMutation({
    mutationFn: async ({
      name,
      body = {},
    }: {
      name: string;
      body?: Record<string, unknown>;
    }) => core(`/api/hospital-command/${hid}/${name}`, body),
    onSuccess: async (_, variables) => {
      await refresh();
      setToast(label(variables.name).toUpperCase() + " · command synchronized");
    },
    onError: (e) => setToast(e.message),
  });
  const act = (name: string, body: Record<string, unknown> = {}) =>
    action.mutate({ name, body });
  const simulation = useMemo(() => new HospitalSimulationEngine(hid), [hid]);
  const demo = useMutation({
    mutationFn: () => simulation.start(),
    onSuccess: async () => {
      await refresh();
      setToast("HOSPITAL DEMO STARTED · 82-second shared scenario");
    },
    onError: (e) => setToast(e.message),
  });
  const hospital = city.hospitals.find((h) => h.id === hid);
  const patients = city.incidents
    .filter((i) => i.hospitalId === hid && i.status !== "CANCELLED")
    .sort(
      (a, b) =>
        Number(b.severity === "CRITICAL") - Number(a.severity === "CRITICAL") ||
        (a.etaSeconds || 0) - (b.etaSeconds || 0),
    );
  const incoming = patients.filter((i) => i.status !== "COMPLETED"),
    incident =
      patients.find((i) => i.id === selected) || incoming[0] || patients.at(-1);
  const prep = incident ? ops?.preparations[incident.id] : undefined,
    team = ops?.teams.find((t) => t.id === prep?.teamId),
    corridor = city.corridors.find((c) => c.id === incident?.corridorId);
  const liveAlerts = ops?.alerts.filter((a) => !a.acknowledged) || [],
    latest = liveAlerts.at(-1);
  useEffect(() => {
    if (!latest || lastAlert.current === latest.id) return;
    lastAlert.current = latest.id;
    if (sound) {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume();
        const oscillator = audio.current.createOscillator(),
          gain = audio.current.createGain();
        oscillator.frequency.value = 580;
        gain.gain.value = 0.025;
        oscillator.connect(gain);
        gain.connect(audio.current.destination);
        oscillator.start();
        oscillator.stop(audio.current.currentTime + 0.18);
        navigator.vibrate?.(80);
      } catch {
        /* optional audio unavailable */
      }
    }
  }, [latest?.id, sound]);
  const viewer = staffRole === "VIEWER",
    commander = ["COMMANDER", "ADMIN"].includes(staffRole),
    clinical = [
      "COMMANDER",
      "ADMIN",
      "EMERGENCY_PHYSICIAN",
      "TRAUMA_LEAD",
      "NURSE_COORDINATOR",
    ].includes(staffRole),
    busy = action.isPending || demo.isPending;
  const free = (kind: string) =>
    ops?.resources.filter((r) => r.kind === kind && r.status === "AVAILABLE")
      .length || 0;
  const taskReady = prep?.tasks.filter((t) => t.status === "READY").length || 0;
  const readiness = prep?.tasks.length
    ? Math.round((taskReady / prep.tasks.length) * 100)
    : Math.round(
        (["ER", "ICU", "TRAUMA", "OT", "VENTILATOR", "CT"].filter(
          (k) => free(k) > 0,
        ).length /
          6) *
          100,
      );
  const teamReady =
    team?.members.filter((m) => m.status === "READY").length || 0;
  const received = incident?.status === "COMPLETED" && prep?.receivedAt;
  const eta = incident?.etaSeconds || 0;
  const countdown =
    incident?.status === "ARRIVED_AT_HOSPITAL"
      ? "AT HOSPITAL GATE"
      : eta <= 30
        ? "GATE APPROACH"
        : eta <= 120
          ? "ARRIVING NOW"
          : eta <= 300
            ? "FINAL PREP"
            : "PREPARATION PHASE";
  const handoverSeconds = prep?.handoverStartedAt
    ? Math.max(0, (stamp - Date.parse(prep.handoverStartedAt)) / 1000)
    : 0;
  const finished = Object.values(ops?.preparations || {}).filter(
      (p) => p.report,
    ),
    avg = finished.length
      ? finished.reduce((s, p) => s + (p.report?.handoverSeconds || 0), 0) /
        finished.length
      : 0;
  const activeStage = [...hospitalDemoStages]
    .reverse()
    .find((s) => (ops?.demoControl.elapsed || 0) >= s.at);
  const selectPatient = (id: string) => {
    store.select(id);
    store.setTab("Receiving");
    setSearchOpen(false);
  };
  if (session.isPending)
    return (
      <div className="hc-loading">
        <Cross /> Connecting to AEGIS hospital authority…
      </div>
    );
  if (!authorized)
    return (
      <HospitalLogin
        onLogin={() => {
          store.clear();
          void cache.invalidateQueries({ queryKey: ["hospital-session"] });
          void cache.invalidateQueries({ queryKey: ["hospital-operations"] });
        }}
      />
    );
  if (!ops || !hospital)
    return (
      <div className="hc-loading">
        <Activity /> Loading hospital resources… {opQuery.error?.message}
        <button onClick={() => void opQuery.refetch()}>Retry</button>
        <button
          onClick={() => {
            void core("/api/auth/session", undefined, "DELETE").then(() =>
              cache.invalidateQueries({ queryKey: ["hospital-session"] }),
            );
          }}
        >
          Sign out
        </button>
      </div>
    );
  const reservations = ops.resources.filter(
    (r) => r.incidentId === incident?.id && r.status === "RESERVED",
  );
  return (
    <div
      className={
        "hc-root " +
        (ops.massCasualty ? "mass-casualty " : "") +
        (expanded ? "focus-mode" : "")
      }
    >
      <header className="hc-commandbar">
        <a className="hc-brand" href="/hospital">
          <span>
            <Cross size={23} />
          </span>
          <div>
            AEGIS <b>HOSPITAL COMMAND</b>
            <small>{hospital.name.toUpperCase()}</small>
          </div>
        </a>
        <div className="hc-header-center">
          <span className={"hc-live-dot " + (!connected ? "offline" : "")} />
          {connected ? "CONNECTED RECEIVING NETWORK" : "RECONNECTING"}
          <Chip tone={hospital.diversion ? "red" : "green"}>
            {hospital.diversion
              ? "TEMPORARY DIVERSION"
              : "ACCEPTING EMERGENCIES"}
          </Chip>
          {ops.demo && <Chip tone="amber">DEMO RESOURCES</Chip>}
        </div>
        <div className="hc-header-actions">
          <time>
            {new Date(stamp).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour12: false,
            })}
            <small>IST · {label(staffRole)}</small>
          </time>
          <button title="Search · Ctrl K" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
          </button>
          <button
            title={sound ? "Mute alerts" : "Enable alert sound"}
            onClick={() => setSound((v) => !v)}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button title="Alerts" onClick={() => setAlertsOpen((v) => !v)}>
            <Bell size={17} />
            {liveAlerts.length > 0 && <i>{liveAlerts.length}</i>}
          </button>
          <button
            title="Full screen"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => setToast("Full screen unavailable"));
            }}
          >
            <Maximize size={17} />
          </button>
          <button
            onClick={() => {
              void core("/api/auth/session", undefined, "DELETE").then(() => {
                store.clear();
                void cache.invalidateQueries({
                  queryKey: ["hospital-session"],
                });
              });
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="hc-metrics">
        {[
          ["Incoming", incoming.length, Ambulance],
          [
            "P1 critical",
            incoming.filter((i) => i.severity === "CRITICAL").length,
            Siren,
          ],
          ["ER beds", free("ER"), Hospital],
          ["ICU beds", free("ICU"), HeartPulse],
          ["OT ready", free("OT"), Cross],
          ["Ventilators", free("VENTILATOR"), Activity],
          [
            "Trauma teams",
            ops.teams.filter(
              (t) =>
                !t.incidentId &&
                t.members.every((m) => m.status !== "UNAVAILABLE"),
            ).length,
            Users,
          ],
          ["Avg handover", finished.length ? time(avg) : "—", Clock],
        ].map(([name, value, Icon]) => {
          const I = Icon as typeof Clock;
          return (
            <div
              key={String(name)}
              className={name === "P1 critical" ? "critical" : ""}
            >
              <I size={15} />
              <small>{String(name)}</small>
              <strong>
                {typeof value === "number"
                  ? String(value).padStart(2, "0")
                  : String(value)}
              </strong>
              <span>
                {name === "Avg handover" ? "completed cases" : "live inventory"}
              </span>
            </div>
          );
        })}
      </div>
      <nav className="hc-toolbar">
        <div>
          {TABS.map((t) => (
            <button
              className={t === tab ? "active" : ""}
              key={t}
              onClick={() => store.setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <aside>
          <button
            className={ops.massCasualty ? "hc-danger" : ""}
            disabled={!commander || busy}
            onClick={() => act("mass-casualty", { enabled: !ops.massCasualty })}
          >
            <Siren size={13} />
            {ops.massCasualty ? "MASS CASUALTY ACTIVE" : "Mass casualty"}
          </button>
          {ops.demo && (
            <>
              <button
                disabled={!commander || busy || ops.demoControl.running}
                onClick={() => demo.mutate()}
              >
                <Play size={13} /> Start hospital demo
              </button>
              <button
                title={
                  ops.demoControl.running
                    ? "Pause hospital demo"
                    : "Resume hospital demo"
                }
                disabled={
                  !commander ||
                  (!ops.demoControl.incidentId && ops.demoControl.elapsed === 0)
                }
                onClick={() =>
                  act("demo-control", {
                    enabled: !ops.demoControl.running,
                    speed: ops.demoControl.speed,
                  })
                }
              >
                {ops.demoControl.running ? (
                  <Pause size={13} />
                ) : (
                  <Play size={13} />
                )}
              </button>
              <select
                aria-label="Hospital demo speed"
                disabled={!commander || busy}
                value={ops.demoControl.speed}
                onChange={(e) =>
                  act("demo-control", {
                    enabled: ops.demoControl.running,
                    speed: Number(e.target.value),
                  })
                }
              >
                {[1, 2, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
            </>
          )}
        </aside>
      </nav>
      {ops.massCasualty && (
        <div className="hc-mci-banner">
          <Siren size={18} />
          <strong>MASS CASUALTY COMMAND</strong>
          <span>
            {incoming.reduce((n, i) => n + (i.patientCount || 1), 0)} incoming
            casualties
          </span>
          {["CRITICAL", "HIGH", "LOW"].map((s, j) => (
            <Chip key={s} tone={j === 0 ? "red" : j === 1 ? "amber" : "green"}>
              P{j + 1} ·{" "}
              {incoming
                .filter((i) => i.severity === s)
                .reduce((n, i) => n + (i.patientCount || 1), 0)}
            </Chip>
          ))}
          <span>
            {free("ICU")} ICU · {free("OT")} OT · {ops.blood["O-"].available} O−
            units
          </span>
        </div>
      )}
      <main className="hc-layout">
        <aside className="hc-incoming">
          <div className="hc-queue-title">
            <small>INCOMING EMERGENCIES</small>
            <Chip>{incoming.length.toString().padStart(2, "0")} LIVE</Chip>
          </div>
          <h1>Ready to receive.</h1>
          <p>Preparation starts before the doors open.</p>
          <div className="hc-queue">
            <AnimatePresence>
              {patients.map((i) => (
                <motion.button
                  layout
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  key={i.id}
                  className={
                    "hc-patient-item " +
                    (incident?.id === i.id ? "selected " : "") +
                    (i.severity === "CRITICAL" ? "critical" : "")
                  }
                  onClick={() => selectPatient(i.id)}
                >
                  <div>
                    <Chip
                      tone={
                        i.status === "COMPLETED"
                          ? "green"
                          : i.severity === "CRITICAL"
                            ? "red"
                            : "amber"
                      }
                    >
                      {i.status === "COMPLETED"
                        ? "RECEIVED"
                        : priority(i) + " " + i.severity}
                    </Chip>
                    <span>{time(i.etaSeconds || 0)}</span>
                  </div>
                  <h3>{i.patientName}</h3>
                  <p>{label(i.emergencyType)}</p>
                  <footer>
                    <Ambulance size={13} />
                    {i.ambulanceId || "Assignment pending"}
                    <ChevronRight size={14} />
                  </footer>
                  <div className="hc-patient-stage">
                    {label(ops.preparations[i.id]?.status || i.status)}
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
            {!patients.length && (
              <div className="hc-empty-queue">
                <ShieldCheck size={35} />
                <strong>HOSPITAL READY</strong>
                <span>
                  Emergency network active.
                  <br />
                  Monitoring incoming demand.
                </span>
              </div>
            )}
          </div>
          <div className="hc-left-bottom">
            <div>
              <Radio size={14} />
              <b>AEGIS NETWORK</b>
              <span>{connected ? "ONLINE" : "CONNECTING"}</span>
            </div>
            <p>
              {ops.demo
                ? "Demo hospital resources. Run the hospital scenario to watch pre-arrival preparation and handover."
                : "Authoritative hospital resources and assigned emergency cases."}
            </p>
            <a href="/control-room">
              Open city command <ArrowRight size={12} />
            </a>
            <a href="/legacy-hospital">
              Original hospital workspace <ArrowRight size={12} />
            </a>
          </div>
        </aside>
        <div className="hc-center">
          {tab === "Receiving" ? (
            <>
              {activeStage && ops.demoControl.incidentId === incident?.id && (
                <motion.div
                  key={activeStage.at}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="hc-demo-story"
                >
                  <Chip tone="amber">DEMO · T+{ops.demoControl.elapsed}s</Chip>
                  <h3>{activeStage.title}</h3>
                  <p>
                    <b>AEGIS:</b> {activeStage.action}
                  </p>
                  <p>
                    <b>NEXT:</b> {activeStage.next}
                  </p>
                </motion.div>
              )}
              {incident ? (
                <motion.section
                  layout
                  className={
                    "hc-hero " +
                    (incident.deteriorating && !received ? "deteriorating" : "")
                  }
                >
                  <div className="hc-hero-top">
                    <div>
                      <small>
                        {received
                          ? "PATIENT TRANSFER COMPLETE"
                          : incident.status === "ARRIVED_AT_HOSPITAL"
                            ? "AMBULANCE ARRIVED"
                            : "PRE-ARRIVAL INTELLIGENCE"}
                      </small>
                      <h1>
                        {received
                          ? "Under hospital care."
                          : label(incident.emergencyType)}
                      </h1>
                      <p>
                        {incident.patientId} · {incident.patientName} ·{" "}
                        {incident.age || "Unknown age"}{" "}
                        {incident.age ? "years" : ""} ·{" "}
                        {incident.sex || "Sex not reported"}
                      </p>
                    </div>
                    <Chip
                      tone={
                        received
                          ? "green"
                          : incident.severity === "CRITICAL"
                            ? "red"
                            : "amber"
                      }
                    >
                      {received
                        ? "PATIENT RECEIVED"
                        : incident.deteriorating
                          ? "DETERIORATING"
                          : priority(incident) + " " + incident.severity}
                    </Chip>
                  </div>
                  <div className="hc-hero-content">
                    <Waveforms
                      incident={incident}
                      demo={!!incident.hospitalDemoId}
                    />
                    <div className="hc-eta">
                      <small>
                        {received ? "HANDOVER COMPLETED" : "AMBULANCE ARRIVAL"}
                      </small>
                      <motion.strong
                        key={received ? "done" : Math.floor(eta / 60)}
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 1 }}
                      >
                        {received
                          ? time(prep?.report?.handoverSeconds || 0)
                          : time(eta)}
                      </motion.strong>
                      <span className={eta <= 120 ? "urgent" : ""}>
                        {received ? "HOSPITAL OWNERSHIP CONFIRMED" : countdown}
                      </span>
                      <div>
                        <b>
                          {((incident.distanceMeters || 0) / 1000).toFixed(1)}{" "}
                          KM
                        </b>
                        <Chip
                          tone={
                            corridor?.status === "ACTIVE" ? "green" : "cyan"
                          }
                        >
                          {corridor?.status === "ACTIVE"
                            ? "GREEN CORRIDOR"
                            : "STANDARD ROUTE"}
                        </Chip>
                      </div>
                    </div>
                  </div>
                  {incident.deteriorating && !received && (
                    <div className="hc-deterioration">
                      <HeartPulse size={15} />
                      <b>PATIENT CONDITION DETERIORATING</b> Checklist expanded
                      · clinician review required
                    </div>
                  )}
                  <div className="hc-hero-footer">
                    <span>
                      <Ambulance size={14} />
                      {incident.ambulanceId}
                    </span>
                    <span>
                      <Radio size={13} />
                      {city.routes.find((r) => r.id === incident.routeId)
                        ?.provider || "Route pending"}
                    </span>
                    <button onClick={() => setExpanded((v) => !v)}>
                      <Maximize size={13} />
                      {expanded ? "Exit focus" : "Patient focus"}
                    </button>
                  </div>
                </motion.section>
              ) : (
                <Panel
                  title="Hospital ready"
                  kicker="EMERGENCY NETWORK ACTIVE"
                  className="hc-ready-hero"
                >
                  <div>
                    <ShieldCheck size={45} />
                    <h1>Prepared for what comes next.</h1>
                    <p>
                      AEGIS is monitoring incoming demand. Run the hospital demo
                      to see the receiving center activate.
                    </p>
                    <button
                      className="hc-primary"
                      disabled={!commander || !ops.demo || busy}
                      onClick={() => demo.mutate()}
                    >
                      <Play size={16} /> Start hospital demo
                    </button>
                  </div>
                </Panel>
              )}
              {hospital && (
                <HospitalMap
                  city={city}
                  hospital={hospital}
                  incident={incident}
                />
              )}
              {incident && <ArrivalProgress incident={incident} prep={prep} />}
              {incident?.status === "ARRIVED_AT_HOSPITAL" &&
                prep?.status !== "HANDOVER" && (
                  <div className="hc-arrival">
                    <Cross size={32} />
                    <div>
                      <h2>AMBULANCE AT THE GATE</h2>
                      <p>
                        {incident.ambulanceId} ·{" "}
                        {reservations.find(
                          (r) => r.kind === "TRAUMA" || r.kind === "ER",
                        )?.id || "Confirm receiving bay"}{" "}
                        · {teamReady}/{team?.members.length || 6} team members
                        ready
                      </p>
                    </div>
                    <button
                      className="hc-primary"
                      disabled={!clinical || busy}
                      onClick={() =>
                        act("handover-start", { incidentId: incident.id })
                      }
                    >
                      Start handover <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              {incident && prep?.status === "HANDOVER" && (
                <Handover
                  incident={incident}
                  prep={prep}
                  seconds={handoverSeconds}
                  disabled={!clinical || busy}
                  act={act}
                />
              )}
              {received && (
                <Panel
                  title="AEGIS hospital response"
                  kicker="PATIENT RECEIVED"
                >
                  <div className="hc-complete">
                    <CheckCheck size={38} />
                    <h2>Prepared before arrival.</h2>
                    <div>
                      {[
                        [
                          "Preparation before arrival",
                          prep?.report?.preparedBeforeArrival ? "YES" : "NO",
                        ],
                        [
                          "Team ready before arrival",
                          prep?.report?.readyBeforeArrival ? "YES" : "NO",
                        ],
                        [
                          "Resources transferred",
                          prep?.report?.resourceIds.length || 0,
                        ],
                        ["Handover", time(prep?.report?.handoverSeconds || 0)],
                      ].map(([k, v]) => (
                        <div key={String(k)}>
                          <small>{k}</small>
                          <b>{v}</b>
                        </div>
                      ))}
                    </div>
                    <p>
                      Hospital ownership confirmed. Ambulance released. Shared
                      command room notified.
                    </p>
                    <small>
                      Time saved requires a measured baseline; no invented
                      clinical benefit is displayed.
                    </small>
                  </div>
                </Panel>
              )}
              <div className="hc-center-pair">
                <Panel title="Receiving department" kicker="LIVE CAPACITY MAP">
                  <CapacityMap ops={ops} incident={incident} />
                </Panel>
                <Panel title="AEGIS clinical prep" kicker="PRE-ARRIVAL SUPPORT">
                  <div className="hc-clinical">
                    <Chip tone="violet">
                      CLINICAL SUPPORT · NOT A FINAL DIAGNOSIS
                    </Chip>
                    <p>
                      {incident
                        ? incident.description ||
                          "Review the reported condition and confirm resource needs with the receiving clinician."
                        : "Incoming assessments will appear here."}
                    </p>
                    {prep?.tasks.map((t) => (
                      <div key={t.id}>
                        <Check size={13} />
                        {t.label}
                      </div>
                    ))}
                    <small>
                      Resource checklist follows reported emergency type and
                      severity. Blood use, treatment and imaging decisions
                      require clinical confirmation.
                    </small>
                  </div>
                </Panel>
              </div>
            </>
          ) : tab === "Resources" ? (
            <Resources ops={ops} disabled={viewer || busy} act={act} />
          ) : tab === "Teams" ? (
            <>
              <Panel title="Receiving teams" kicker="STAFF ASSEMBLY">
                {ops.teams.map((t) => (
                  <div className="hc-team-card" key={t.id}>
                    <div>
                      <Users size={17} />
                      <h3>{t.name}</h3>
                      <Chip tone={t.incidentId ? "cyan" : "green"}>
                        {t.incidentId ? "ASSIGNED" : "AVAILABLE"}
                      </Chip>
                    </div>
                    {t.members.map((m) => (
                      <div className="hc-staff" key={m.id}>
                        <span>{initials(m.name)}</span>
                        <div>
                          <b>{m.name}</b>
                          <small>{m.role}</small>
                        </div>
                        <Chip
                          tone={
                            m.status === "READY" || m.status === "AVAILABLE"
                              ? "green"
                              : m.status === "UNAVAILABLE"
                                ? "red"
                                : "amber"
                          }
                        >
                          {m.status}
                        </Chip>
                        {t.incidentId && m.status !== "READY" && (
                          <button
                            disabled={viewer || busy}
                            onClick={() =>
                              act(
                                m.status === "UNAVAILABLE"
                                  ? "substitute"
                                  : "team-ready",
                                { incidentId: t.incidentId, resourceId: m.id },
                              )
                            }
                          >
                            {m.status === "UNAVAILABLE"
                              ? "Reassign"
                              : "Confirm"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </Panel>
              <Panel title="Staff coverage">
                <div className="hc-coverage">
                  {Object.entries(ops.staffCounts).map(([k, v]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          ) : tab === "Patient board" ? (
            <Panel title="Emergency patient board" kicker="HOSPITAL OWNERSHIP">
              <div className="hc-board">
                {ops.board.length ? (
                  ops.board.map((p) => (
                    <button
                      key={p.incidentId}
                      onClick={() => selectPatient(p.incidentId)}
                    >
                      <Chip tone={p.priority === "CRITICAL" ? "red" : "amber"}>
                        {p.priority}
                      </Chip>
                      <div>
                        <b>{p.name}</b>
                        <small>{p.patientId}</small>
                      </div>
                      <span>{p.location}</span>
                      <span>{p.teamId}</span>
                      <span>
                        {time((stamp - Date.parse(p.receivedAt)) / 1000)} in ER
                      </span>
                      <Chip tone="green">UNDER CARE</Chip>
                    </button>
                  ))
                ) : (
                  <div className="hc-empty">
                    <Hospital size={30} />
                    <p>Received patients appear after confirmed handover.</p>
                  </div>
                )}
              </div>
            </Panel>
          ) : tab === "Command link" ? (
            <>
              <Chat
                ops={ops}
                incident={incident}
                disabled={viewer || busy}
                act={act}
                channel="COMMAND"
              />
              <Chat
                ops={ops}
                incident={incident}
                disabled={viewer || busy}
                act={act}
                channel="TEAM"
              />
            </>
          ) : tab === "Analytics" ? (
            <Analytics ops={ops} incoming={incoming} />
          ) : tab === "Policies" ? (
            <Policies
              ops={ops}
              hospitalDiverting={hospital.diversion}
              disabled={!commander || busy}
              act={act}
            />
          ) : tab === "System health" ? (
            <Health connected={connected} demo={ops.demo} />
          ) : (
            <Panel title="Hospital audit log" kicker="DURABLE SERVER EVENTS">
              <div className="hc-audit">
                {[...ops.audit]
                  .reverse()
                  .slice(0, 100)
                  .map((e) => (
                    <div key={e.eventId}>
                      <time>{clock(e.occurredAt)}</time>
                      <b>{label(e.type.replace("hospital.", ""))}</b>
                      <small>{JSON.stringify(e.details)}</small>
                    </div>
                  ))}
              </div>
            </Panel>
          )}
        </div>
        <aside className="hc-readiness">
          <Panel title="Hospital readiness" kicker="PREPARATION COMMAND">
            <Gauge
              value={readiness}
              title={
                readiness === 100 ? "READY TO RECEIVE" : "PREPARATION STATUS"
              }
            />
            <div className="hc-readiness-verdict">
              <ShieldCheck size={16} />
              {hospital.diversion
                ? "HOSPITAL IN DIVERSION"
                : readiness === 100
                  ? "READY FOR CRITICAL ARRIVAL"
                  : prep?.conflicts.length
                    ? "RESOURCE CONFLICT"
                    : "PREPARATION IN PROGRESS"}
            </div>
            <div className="hc-readiness-factors">
              {["ICU", "TRAUMA", "CT", "BLOOD", "VENTILATOR"].map((k) => {
                const task = prep?.tasks.find((t) => t.id === k),
                  available =
                    k === "BLOOD" ? ops.blood["O-"].available : free(k);
                return (
                  <div key={k}>
                    <span>{k}</span>
                    <b
                      className={
                        task?.status === "READY"
                          ? "cyan"
                          : available
                            ? "green"
                            : "amber"
                      }
                    >
                      {task?.status === "READY"
                        ? "RESERVED"
                        : available
                          ? "AVAILABLE"
                          : "REVIEW"}
                    </b>
                  </div>
                );
              })}
            </div>
            <button
              className="hc-primary hc-prepare"
              disabled={
                !incident ||
                viewer ||
                busy ||
                incident.status === "COMPLETED" ||
                ["BLOOD_BANK", "RADIOLOGY"].includes(staffRole)
              }
              onClick={() => act("prepare", { incidentId: incident?.id })}
            >
              <Cross size={17} />
              {prep?.startedAt ? "Update preparation" : "Accept & prepare"}
            </button>
            {incident &&
              clinical &&
              incident.status === "HOSPITAL_ASSIGNED" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    act("acknowledge", { incidentId: incident.id })
                  }
                >
                  Acknowledge patient
                </button>
              )}
            <small className="hc-score-note">
              Operational checklist completion · not a clinical safety
              probability
            </small>
          </Panel>
          {incident && (
            <Panel
              title="Preparation checklist"
              kicker={prep?.status || "WAITING"}
            >
              <div className="hc-tasks">
                {prep?.tasks.map((t) => (
                  <motion.div
                    layout
                    className={
                      t.status === "READY"
                        ? "ready"
                        : t.status === "CONFLICT"
                          ? "conflict"
                          : ""
                    }
                    key={t.id}
                  >
                    <span>
                      {t.status === "READY" ? (
                        <Check size={13} />
                      ) : t.status === "CONFLICT" ? (
                        <Siren size={13} />
                      ) : (
                        <Clock size={13} />
                      )}
                    </span>
                    <div>
                      <b>{t.label}</b>
                      <small>{t.resourceId || label(t.status)}</small>
                    </div>
                    {!["READY", "ASSEMBLING"].includes(t.status) && (
                      <button
                        title={"Reserve " + t.id}
                        disabled={
                          viewer || busy || incident.status === "COMPLETED"
                        }
                        onClick={() =>
                          act("reserve", {
                            incidentId: incident.id,
                            kind: t.id,
                          })
                        }
                      >
                        <LockKeyhole size={13} />
                      </button>
                    )}
                  </motion.div>
                ))}
              </div>
              {prep?.conflicts.map((c) => (
                <p className="hc-error" key={c}>
                  {c}
                </p>
              ))}
            </Panel>
          )}
          {team && (
            <Panel title={team.name} kicker="TEAM ASSEMBLY">
              <div className="hc-team-progress">
                <strong>
                  {teamReady}
                  <em>/{team.members.length}</em>
                </strong>
                <div>
                  <small>TEAM READINESS</small>
                  <b>{Math.round((teamReady / team.members.length) * 100)}%</b>
                </div>
              </div>
              {team.members.map((m) => (
                <div className="hc-staff compact" key={m.id}>
                  <span>{initials(m.name)}</span>
                  <div>
                    <b>{m.name}</b>
                    <small>{m.role}</small>
                  </div>
                  {m.status === "READY" ? (
                    <Check size={14} className="green" />
                  ) : (
                    <button
                      disabled={viewer || busy}
                      onClick={() =>
                        act(
                          m.status === "UNAVAILABLE"
                            ? "substitute"
                            : "team-ready",
                          { incidentId: incident!.id, resourceId: m.id },
                        )
                      }
                    >
                      {m.status === "UNAVAILABLE" ? "Reassign" : "Confirm"}
                    </button>
                  )}
                </div>
              ))}
              {teamReady < team.members.length && (
                <p className="hc-warning">
                  TEAM INCOMPLETE · confirm specialist availability before
                  arrival
                </p>
              )}
            </Panel>
          )}
          {reservations.length > 0 && (
            <Panel title="Locked for arrival" kicker={incident?.patientId}>
              <div className="hc-reservations">
                {reservations.map((r) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={r.id}
                  >
                    <LockKeyhole size={13} />
                    <b>{r.id}</b>
                    <Chip>RESERVED</Chip>
                  </motion.div>
                ))}
              </div>
            </Panel>
          )}
          <Panel title="Blood bank" kicker="INVENTORY & RESERVATIONS">
            <div className="hc-blood-mini">
              <strong>
                {ops.blood["O-"].available}
                <small>O− AVAILABLE</small>
              </strong>
              <span>
                {Object.values(ops.blood["O-"].reserved).reduce(
                  (a, b) => a + b,
                  0,
                )}{" "}
                reserved
              </span>
            </div>
            <button
              disabled={
                !incident ||
                viewer ||
                busy ||
                !prep?.tasks.some((t) => t.id === "BLOOD") ||
                incident.status === "COMPLETED"
              }
              onClick={() =>
                act("reserve", { incidentId: incident?.id, kind: "BLOOD" })
              }
            >
              Reserve blood <LockKeyhole size={12} />
            </button>
          </Panel>
          {corridor && (
            <Panel title="Green corridor" kicker="SHARED SIGNAL COORDINATION">
              <Chip tone={corridor.status === "ACTIVE" ? "green" : "amber"}>
                {label(corridor.status)}
              </Chip>
              <div className="hc-signal-line">
                {corridor.signals.map((s) => (
                  <span
                    key={s.id}
                    title={s.id + " · " + s.state}
                    className={s.state.toLowerCase()}
                  />
                ))}
              </div>
              <p>
                {corridor.signals.filter((s) => s.state === "GREEN").length}/
                {corridor.signals.length} signals green · demo controller
              </p>
            </Panel>
          )}
          {incident && !received && (
            <div className="hc-quick-actions">
              <button
                disabled={viewer || busy}
                onClick={() =>
                  act("message", {
                    incidentId: incident.id,
                    text: "Receiving team requests additional patient assessment.",
                    channel: "COMMAND",
                  })
                }
              >
                Request more info <MessageSquare size={13} />
              </button>
              <button
                className="hc-danger"
                disabled={
                  !clinical || busy || incident.status === "ARRIVED_AT_HOSPITAL"
                }
                onClick={() => {
                  if (
                    confirm(
                      "Request diversion and release this patient’s reserved resources?",
                    )
                  )
                    act("divert", {
                      incidentId: incident.id,
                      reason: "Receiving team requests alternative hospital",
                    });
                }}
              >
                Request diversion <ArrowRight size={13} />
              </button>
            </div>
          )}
        </aside>
      </main>
      <footer className="hc-eventfeed">
        <div>
          <Radio size={13} />
          <b>LIVE EVENT FEED</b>
          <span>{connected ? "LIVE" : "RECONNECTING"}</span>
        </div>
        <section>
          {[...ops.audit]
            .reverse()
            .slice(0, 7)
            .map((e) => (
              <span key={e.eventId}>
                <time>{clock(e.occurredAt)}</time>
                {label(e.type.replace("hospital.", ""))}
              </span>
            ))}
        </section>
        <small>REV {city.revision} · IN-APP LINK</small>
      </footer>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="hc-toast"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <ShieldCheck size={16} />
            {toast}
            <button title="Dismiss notification" onClick={() => setToast("")}>
              <X size={14} />
            </button>
          </motion.div>
        )}
        {alertsOpen && (
          <motion.aside
            className="hc-alert-drawer"
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
          >
            <div>
              <h2>Hospital alerts</h2>
              <button title="Close alerts" onClick={() => setAlertsOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {[...ops.alerts].reverse().map((a) => (
              <article key={a.id}>
                <Chip tone={a.acknowledged ? "green" : "red"}>
                  {a.acknowledged ? "ACKNOWLEDGED" : "REVIEW REQUIRED"}
                </Chip>
                <h3>{a.text}</h3>
                <small>{clock(a.createdAt)}</small>
                <footer>
                  {a.incidentId && (
                    <button
                      onClick={() => {
                        selectPatient(a.incidentId!);
                        setAlertsOpen(false);
                      }}
                    >
                      Open patient
                    </button>
                  )}
                  <button
                    disabled={viewer || a.acknowledged || busy}
                    onClick={() => act("alert-ack", { resourceId: a.id })}
                  >
                    Acknowledge
                  </button>
                </footer>
              </article>
            ))}
            {!ops.alerts.length && <p>No active hospital alerts.</p>}
          </motion.aside>
        )}
        {searchOpen && (
          <div
            className="hc-modal-backdrop"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              className="hc-palette"
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <Search size={18} />
                <input
                  autoFocus
                  aria-label="Search hospital command"
                  placeholder="Search patient, ambulance or command…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  title="Close search"
                  onClick={() => setSearchOpen(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <section>
                {patients
                  .filter((i) =>
                    `${i.patientName} ${i.patientId} ${i.ambulanceId}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((i) => (
                    <button key={i.id} onClick={() => selectPatient(i.id)}>
                      <Ambulance size={15} />
                      <b>{i.patientName}</b>
                      <span>
                        {i.ambulanceId} · {priority(i)}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                {TABS.filter((t) =>
                  t.toLowerCase().includes(search.toLowerCase()),
                ).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      store.setTab(t);
                      setSearchOpen(false);
                    }}
                  >
                    <Layers size={15} />
                    {t}
                    <ChevronRight size={15} />
                  </button>
                ))}
                {[
                  "Prepare for arrival",
                  "Activate mass casualty",
                  "Reserve ICU",
                  "Reserve trauma bay",
                  "Notify specialist",
                ]
                  .filter((t) => t.toLowerCase().includes(search.toLowerCase()))
                  .map((t) => (
                    <button
                      key={t}
                      disabled={
                        viewer ||
                        !incident ||
                        busy ||
                        (t === "Activate mass casualty" && !commander)
                      }
                      onClick={() => {
                        if (t === "Activate mass casualty")
                          act("mass-casualty", { enabled: true });
                        else if (
                          t === "Reserve ICU" ||
                          t === "Reserve trauma bay"
                        )
                          act("reserve", {
                            incidentId: incident?.id,
                            kind: t === "Reserve ICU" ? "ICU" : "TRAUMA",
                          });
                        else act("prepare", { incidentId: incident?.id });
                        setSearchOpen(false);
                      }}
                    >
                      <Command size={15} />
                      {t}
                      <ArrowRight size={15} />
                    </button>
                  ))}
              </section>
              <footer>
                <kbd>ESC</kbd> close · <kbd>↵</kbd> select with pointer · Ctrl /
                ⌘ K
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
function ArrivalProgress({
  incident,
  prep,
}: {
  incident: Incident;
  prep?: Preparation;
}) {
  const states = [
    "Ambulance assigned",
    "Patient picked up",
    "Hospital selected",
    "Acknowledged",
    "Team preparing",
    "Final approach",
    "At gate",
    "Handover",
  ];
  let stage =
    incident.status === "COMPLETED"
      ? 8
      : incident.status === "ARRIVED_AT_HOSPITAL"
        ? prep?.handoverStartedAt
          ? 7
          : 6
        : incident.hospitalId
          ? incident.status === "HOSPITAL_ASSIGNED"
            ? 2
            : prep?.startedAt
              ? incident.distanceMeters != null &&
                incident.distanceMeters < 2000
                ? 5
                : 4
              : 3
          : incident.ambulanceId
            ? 0
            : -1;
  return (
    <div className="hc-arrival-progress">
      {states.map((s, j) => (
        <div
          key={s}
          className={j < stage ? "done" : j === stage ? "current" : ""}
        >
          <span>{j < stage ? <Check size={10} /> : j + 1}</span>
          <small>{s}</small>
        </div>
      ))}
    </div>
  );
}
type Act = (name: string, body?: Record<string, unknown>) => void;
function CapacityMap({
  ops,
  incident,
}: {
  ops: HospitalOperations;
  incident?: Incident;
}) {
  return (
    <div className="hc-capacity-map">
      {["TRAUMA", "ER", "ICU", "OT", "CT", "XRAY"].map((k) => (
        <div key={k}>
          <small>{k === "ER" ? "RESUS / EMERGENCY" : k}</small>
          <div>
            {ops.resources
              .filter((r) => r.kind === k)
              .slice(0, k === "ICU" ? 12 : k === "ER" ? 6 : 5)
              .map((r) => (
                <span
                  title={`${r.id} · ${r.status} · ${r.patientId || ""}`}
                  key={r.id}
                  className={
                    r.status.toLowerCase() +
                    (r.incidentId === incident?.id ? " selected" : "")
                  }
                >
                  {r.id.replace(k + "-", "")}
                  {r.status === "RESERVED" && <LockKeyhole size={8} />}
                </span>
              ))}
          </div>
        </div>
      ))}
      <footer>
        <i className="available" /> AVAILABLE <i className="reserved" />{" "}
        RESERVED <i className="in_use" /> OCCUPIED
      </footer>
    </div>
  );
}
function Handover({
  incident,
  prep,
  seconds,
  disabled,
  act,
}: {
  incident: Incident;
  prep: Preparation;
  seconds: number;
  disabled: boolean;
  act: Act;
}) {
  const [notes, setNotes] = useState(prep.handover);
  useEffect(() => setNotes(prep.handover), [incident.id]);
  return (
    <Panel title="Structured patient handover" kicker="MIST RECEIVING MODE">
      <div className="hc-handover-timer">
        <Clock size={20} />
        <span>HANDOVER TIME</span>
        <strong
          className={seconds > 300 ? "red" : seconds > 240 ? "amber" : "green"}
        >
          {time(seconds)}
        </strong>
        <small>TARGET &lt; 5 MIN</small>
      </div>
      <div className="hc-mist">
        {[
          ["mechanism", "M", "Mechanism", incident.emergencyType],
          ["injuries", "I", "Injuries suspected", "Not confirmed"],
          [
            "signs",
            "S",
            "Signs",
            Object.entries(incident.vitals)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · "),
          ],
          ["treatment", "T", "Treatment", "Confirm ambulance interventions"],
        ].map(([key, letter, title, placeholder]) => (
          <label key={key}>
            <span>{letter}</span>
            <div>
              <b>{title}</b>
              <textarea
                aria-label={title}
                value={notes[key] || ""}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
              />
            </div>
          </label>
        ))}
      </div>
      <div className="hc-handover-extra">
        {["medications", "allergies", "history", "notes"].map((key) => (
          <label key={key}>
            {label(key)}
            <input
              aria-label={"Handover " + key}
              placeholder="Unknown · verify with paramedic"
              value={notes[key] || ""}
              disabled={disabled}
              onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="hc-handover-checks">
        {CHECKS.map((k) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={!!prep.handoverChecklist[k]}
              disabled={disabled}
              onChange={(e) =>
                act("handover-save", {
                  incidentId: incident.id,
                  checklist: { [k]: e.target.checked },
                })
              }
            />
            {k}
          </label>
        ))}
      </div>
      <div className="hc-handover-actions">
        <button
          disabled={disabled}
          onClick={() =>
            act("handover-save", { incidentId: incident.id, handover: notes })
          }
        >
          Save MIST handover
        </button>
        <button
          className="hc-primary"
          disabled={
            disabled ||
            ![
              "Patient received",
              "Vitals confirmed",
              "Documentation received",
            ].every((k) => prep.handoverChecklist[k])
          }
          onClick={() => act("receive", { incidentId: incident.id })}
        >
          Accept patient <CheckCheck size={16} />
        </button>
      </div>
    </Panel>
  );
}
function Resources({
  ops,
  disabled,
  act,
}: {
  ops: HospitalOperations;
  disabled: boolean;
  act: Act;
}) {
  const [kind, setKind] = useState("ALL");
  return (
    <>
      <Panel
        title="Emergency resource inventory"
        kicker="ATOMIC PATIENT RESERVATIONS"
      >
        <div className="hc-resource-summary">
          {["ER", "ICU", "TRAUMA", "VENTILATOR", "OT", "CT"].map((k) => (
            <button
              key={k}
              className={kind === k ? "active" : ""}
              onClick={() => setKind(k)}
            >
              <small>{k}</small>
              <strong>
                {
                  ops.resources.filter(
                    (r) => r.kind === k && r.status === "AVAILABLE",
                  ).length
                }
                <em>/{ops.resources.filter((r) => r.kind === k).length}</em>
              </strong>
              <span>available</span>
            </button>
          ))}
        </div>
        <div className="hc-resource-filter">
          <select
            aria-label="Resource category"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {["ALL", ...new Set(ops.resources.map((r) => r.kind))].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <small>
            Reservations persist across browsers; occupied resources cannot be
            double booked.
          </small>
        </div>
        <div className="hc-resource-grid">
          {ops.resources
            .filter((r) => kind === "ALL" || r.kind === kind)
            .map((r) => (
              <article className={r.status.toLowerCase()} key={r.id}>
                <div>
                  <Cross size={15} />
                  <b>{r.id}</b>
                  <Chip
                    tone={
                      r.status === "AVAILABLE"
                        ? "green"
                        : r.status === "RESERVED"
                          ? "cyan"
                          : r.status === "UNAVAILABLE"
                            ? "red"
                            : "amber"
                    }
                  >
                    {label(r.status)}
                  </Chip>
                </div>
                <p>{r.patientId || "No incoming reservation"}</p>
                <select
                  aria-label={"Status " + r.id}
                  disabled={disabled || r.status === "RESERVED"}
                  value={r.status}
                  onChange={(e) =>
                    act("resource-status", {
                      resourceId: r.id,
                      status: e.target.value,
                    })
                  }
                >
                  {[
                    "AVAILABLE",
                    "IN_USE",
                    "UNAVAILABLE",
                    ...(r.status === "RESERVED" ? ["RESERVED"] : []),
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </article>
            ))}
        </div>
      </Panel>
      <Panel title="Blood bank inventory" kicker="AVAILABLE / RESERVED">
        <div className="hc-blood-grid">
          {Object.entries(ops.blood).map(([group, stock]) => (
            <article key={group}>
              <small>{group}</small>
              <strong>{stock.available}</strong>
              <span>
                {Object.values(stock.reserved).reduce((a, b) => a + b, 0)}{" "}
                reserved
              </span>
            </article>
          ))}
        </div>
        <p className="hc-muted">
          Reserve blood from the selected patient's preparation checklist. Demo
          allocation requires clinician confirmation before use.
        </p>
      </Panel>
    </>
  );
}
function Chat({
  ops,
  incident,
  disabled,
  act,
  channel,
}: {
  ops: HospitalOperations;
  incident?: Incident;
  disabled: boolean;
  act: Act;
  channel: string;
}) {
  const [text, setText] = useState("");
  const messages = ops.messages.filter(
    (m) =>
      m.channel === channel &&
      (!incident || m.incidentId === incident.id || !m.incidentId),
  );
  return (
    <Panel
      title={
        channel === "TEAM" ? "Incident team channel" : "AEGIS command link"
      }
      kicker={incident?.id || "HOSPITAL CHANNEL"}
    >
      <div className="hc-chat">
        {messages.map((m) => (
          <article key={m.id}>
            <div>
              <b>{label(m.sender)}</b>
              <time>{clock(m.createdAt)}</time>
            </div>
            <p>{m.text}</p>
          </article>
        ))}
        {!messages.length && (
          <p className="hc-muted">
            Send an in-app update to the shared command timeline.
          </p>
        )}
      </div>
      <div className="hc-chat-quick">
        {["ACKNOWLEDGED", "READY", "NEED MORE INFO"].map((t) => (
          <button
            disabled={disabled}
            key={t}
            onClick={() =>
              act("message", { incidentId: incident?.id, text: t, channel })
            }
          >
            {t}
          </button>
        ))}
      </div>
      <form
        className="hc-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          act("message", { incidentId: incident?.id, text, channel });
          setText("");
        }}
      >
        <input
          aria-label={channel + " message"}
          value={text}
          maxLength={2000}
          placeholder="Update receiving readiness…"
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
        />
        <button
          title={"Send " + channel + " message"}
          disabled={disabled || !text.trim()}
        >
          <Send size={16} />
        </button>
      </form>
    </Panel>
  );
}
function Policies({
  ops,
  hospitalDiverting,
  disabled,
  act,
}: {
  ops: HospitalOperations;
  hospitalDiverting: boolean;
  disabled: boolean;
  act: Act;
}) {
  const [reason, setReason] = useState("ICU FULL");
  return (
    <>
      <Panel
        title="Emergency acceptance policy"
        kicker="CONNECTED TO HOSPITAL SELECTION"
      >
        <div className="hc-policies">
          {Object.entries(ops.policy).map(([k, v]) => (
            <label key={k}>
              <span>{label(k)}</span>
              <input
                type="checkbox"
                checked={v}
                disabled={disabled}
                onChange={(e) =>
                  act("policy", { policy: { [k]: e.target.checked } })
                }
              />
              <Chip tone={v ? "green" : "amber"}>
                {v ? "ACCEPT" : "UNAVAILABLE"}
              </Chip>
            </label>
          ))}
        </div>
        <p className="hc-muted">
          Policy changes are audited and used by shared hospital ranking.
          Pediatric and burns flags are recorded for future intake categories.
        </p>
      </Panel>
      <Panel
        title="Temporary hospital diversion"
        kicker="NETWORK CAPACITY COMMAND"
      >
        <div className="hc-diversion">
          <Chip tone={hospitalDiverting ? "red" : "green"}>
            {hospitalDiverting ? "DIVERSION ACTIVE" : "ACCEPTING EMERGENCIES"}
          </Chip>
          <p>
            {ops.diversionReason ||
              "Changing availability immediately updates incoming assignments and the control room."}
          </p>
          <select
            aria-label="Diversion reason"
            value={reason}
            disabled={disabled}
            onChange={(e) => setReason(e.target.value)}
          >
            {[
              "ICU FULL",
              "TRAUMA TEAM BUSY",
              "OT UNAVAILABLE",
              "MASS CASUALTY",
              "EQUIPMENT FAILURE",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button
            className={hospitalDiverting ? "hc-primary" : "hc-danger"}
            disabled={disabled}
            onClick={() => {
              if (
                hospitalDiverting ||
                confirm(
                  "Mark hospital unavailable and request diversion of assigned incoming cases?",
                )
              )
                act("diversion", { enabled: !hospitalDiverting, reason });
            }}
          >
            {hospitalDiverting ? "Resume accepting" : "Temporarily unavailable"}
          </button>
        </div>
      </Panel>
    </>
  );
}
function Analytics({
  ops,
  incoming,
}: {
  ops: HospitalOperations;
  incoming: Incident[];
}) {
  const points = Array.from({ length: 6 }, (_, j) => {
    const start = Date.now() - (5 - j) * 300000;
    return {
      time: new Date(start).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      events: ops.audit.filter(
        (e) =>
          Date.parse(e.occurredAt) >= start &&
          Date.parse(e.occurredAt) < start + 300000 &&
          !e.type.includes("location.updated"),
      ).length,
    };
  });
  const total = ops.resources.filter((r) => r.kind === "ICU").length,
    occupied = ops.resources.filter(
      (r) => r.kind === "ICU" && r.status === "IN_USE",
    ).length,
    reserved = ops.resources.filter(
      (r) => r.kind === "ICU" && r.status === "RESERVED",
    ).length;
  const risk = Math.min(
    100,
    Math.round(
      ((incoming.length +
        ops.resources.filter((r) => r.kind === "ER" && r.status === "IN_USE")
          .length) /
        18) *
        100,
    ),
  );
  return (
    <>
      <Panel
        title="Receiving activity"
        kicker="OBSERVED 30-MINUTE EVENT HISTORY"
      >
        <div className="hc-chart">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={points}>
              <defs>
                <linearGradient
                  id="hospitalActivity"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#32d8f2" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#32d8f2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: "#76949e", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#0a1118",
                  border: "1px solid #25404e",
                }}
              />
              <Area
                type="monotone"
                dataKey="events"
                stroke="#32d8f2"
                fill="url(#hospitalActivity)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel
        title="Capacity outlook"
        kicker="CURRENT ASSIGNMENTS · NO ARRIVAL FORECAST MODEL"
      >
        <div className="hc-outlook">
          <Gauge value={risk} title="LOAD INDICATOR" size={130} />
          <div>
            <p>
              Known incoming emergencies <b>{incoming.length}</b>
            </p>
            <p>
              Known critical arrivals{" "}
              <b>{incoming.filter((i) => i.severity === "CRITICAL").length}</b>
            </p>
            <p>
              Committed ICU occupancy{" "}
              <b>
                {Math.round(((occupied + reserved) / Math.max(1, total)) * 100)}
                %
              </b>
            </p>
            <p>
              O− inventory{" "}
              <b>{ops.blood["O-"].available < 3 ? "LOW" : "AVAILABLE"}</b>
            </p>
            <Chip tone={risk > 80 ? "amber" : "green"}>
              {risk > 80
                ? "REVIEW ADDITIONAL RECEIVING CAPACITY"
                : "MONITOR CURRENT ASSIGNMENTS"}
            </Chip>
          </div>
        </div>
        <p className="hc-muted">
          Capacity outlook uses current occupied and reserved resources. Future
          unreported arrivals are not invented.
        </p>
      </Panel>
    </>
  );
}
function Health({ connected, demo }: { connected: boolean; demo: boolean }) {
  const health = useQuery({
    queryKey: ["hospital-health"],
    queryFn: () =>
      core<{ status: string; revision: number }>("/api/system/health"),
    refetchInterval: 10000,
  });
  return (
    <Panel title="Hospital system health" kicker="ACTUAL CONNECTION STATUS">
      <div className="hc-health-grid">
        {[
          ["AEGIS API", health.data ? "ONLINE" : "CONNECTING"],
          ["WebSocket", connected ? "CONNECTED" : "RECONNECTING"],
          ["Hospital resources", demo ? "DEMO INVENTORY" : "SHARED INVENTORY"],
          ["Ambulance feed", demo ? "DEMO GPS" : "SHARED GPS"],
          ["Blood bank", demo ? "DEMO STOCK" : "MANUAL INVENTORY"],
          ["Radiology", demo ? "DEMO RESOURCES" : "MANUAL INVENTORY"],
          ["Notifications", "IN-APP ONLY"],
          ["Persistence", "SHARED DATABASE"],
        ].map(([k, v]) => (
          <article key={k}>
            <Radio size={16} />
            <h3>{k}</h3>
            <Chip tone={v === "RECONNECTING" ? "amber" : "green"}>{v}</Chip>
          </article>
        ))}
      </div>
      <p className="hc-muted">
        External hospital systems, staff pagers and medical monitors require
        configured providers; demo data is explicitly marked.
      </p>
    </Panel>
  );
}
