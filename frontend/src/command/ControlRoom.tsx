import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Ambulance,
  Hospital,
  Camera,
  Radio,
  Route,
  Shield,
  Search,
  Bell,
  PanelLeftClose,
  PanelRightClose,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Command,
  Check,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
  Maximize,
  BarChart3,
  HeartPulse,
  TriangleAlert,
  LogOut,
  ExternalLink,
  Brain,
  Clock,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  core,
  type City,
  type Incident,
  type Operator,
  type Event,
} from "../services/ecosystem";
import { useCommandStore } from "../stores/command";
import { CommandMap } from "./CommandMap";
import { DemoCameraFeed } from "./DemoCameraFeed";
import { SimulationEngine } from "../simulation/SimulationEngine";
import { RoadVision } from "../RoadVision";
import "./command.css";
const ended = (i: Incident) => ["COMPLETED", "CANCELLED"].includes(i.status);
const duration = (s: number | null | undefined) =>
  s == null
    ? "—"
    : `${Math.floor(s / 60)
        .toString()
        .padStart(2, "0")}:${Math.round(s % 60)
        .toString()
        .padStart(2, "0")}`;
const readable = (s: string) => s.replaceAll("_", " ").replaceAll(".", " ");
const label = (e: Event) => readable(e.type);
const NAV = [
  ["Live Operations", Activity],
  ["Active Incidents", TriangleAlert],
  ["Ambulance Fleet", Ambulance],
  ["Hospital Network", Hospital],
  ["Road Intelligence", Route],
  ["Camera AI", Camera],
  ["Green Corridor", Radio],
  ["AI Intelligence", Brain],
  ["Analytics", BarChart3],
  ["System Health", HeartPulse],
  ["Event History", Clock],
] as const;
export function ControlRoom() {
  const {
    city,
    setCity,
    selected,
    select,
    focus,
    setFocus,
    tab,
    setTab,
    leftOpen,
    rightOpen,
    toggle,
    setLayer,
  } = useCommandStore();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["command-session"],
    queryFn: () =>
      core<{ state: City; user: Operator }>("/api/ecosystem/state"),
    retry: false,
  });
  const [connection, setConnection] = useState("CONNECTING"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [palette, setPalette] = useState(false),
    [search, setSearch] = useState(""),
    [create, setCreate] = useState(false),
    [notifications, setNotifications] = useState(false),
    [sound, setSound] = useState(false),
    [intro, setIntro] = useState(
      !sessionStorage.getItem("aegis.command.intro"),
    ),
    [time, setTime] = useState(new Date()),
    [toast, setToast] = useState<Event | null>(null),
    [camera, setCamera] = useState(""),
    [loginKey, setLoginKey] = useState(""),
    [hospitalMessage, setHospitalMessage] = useState("");
  const [patient, setPatient] = useState("Demo patient"),
    [type, setType] = useState("ROAD_ACCIDENT"),
    [severity, setSeverity] = useState("CRITICAL"),
    [district, setDistrict] = useState("Madhapur"),
    [lat, setLat] = useState("17.448"),
    [lon, setLon] = useState("78.391"),
    [notes, setNotes] = useState(""),
    [patientCount, setPatientCount] = useState(1);
  const seen = useRef("");
  const booting = useRef(false);
  const socket = useRef<WebSocket | null>(null);
  const health = useQuery({
    queryKey: ["command-health"],
    queryFn: () =>
      core<{ services: Record<string, string> }>("/api/system/health"),
    enabled: !!session.data,
    refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
      method,
    }: {
      path: string;
      body: unknown;
      method: string;
    }) => core(path, body, method),
  });
  async function action(path: string, body: unknown = {}, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const result = await mutation.mutateAsync({ path, body, method });
      const next = await core<{ state: City }>("/api/ecosystem/state");
      setCity(next.state);
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (session.data) setCity(session.data.state);
  }, [session.data, setCity]);
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const introTimer = setTimeout(() => {
      setIntro(false);
      sessionStorage.setItem("aegis.command.intro", "yes");
    }, 2500);
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setCreate(false);
        setCamera("");
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(timer);
      clearTimeout(introTimer);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!session.data) return;
    let active = true,
      retry: ReturnType<typeof setTimeout>;
    function connect() {
      if (!active) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/command`,
      );
      socket.current = ws;
      ws.onopen = () => setConnection("ONLINE");
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "state") setCity(data.state);
        } catch {
          setError("Invalid command update; recovering snapshot");
        }
      };
      ws.onclose = () => {
        if (active) {
          setConnection("RECONNECTING");
          retry = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      active = false;
      clearTimeout(retry);
      socket.current?.close();
    };
  }, [session.data?.user.role, setCity]);
  useEffect(() => {
    if (
      !session.data ||
      booting.current ||
      city.incidents.length ||
      city.ambulances.length
    )
      return;
    if (
      session.data.user.role !== "CONTROL_ROOM_OPERATOR" &&
      session.data.user.role !== "SYSTEM_ADMIN"
    )
      return;
    booting.current = true;
    void action("/api/demo/start");
  }, [session.data, city.incidents.length, city.ambulances.length]);
  useEffect(() => {
    const event = [...city.events]
      .reverse()
      .find(
        (e) =>
          ![
            "ambulance.location.updated",
            "route.eta.updated",
            "green_corridor.updated",
            "hospital.rankings.updated",
          ].includes(e.type),
      );
    if (event && event.eventId !== seen.current) {
      if (seen.current) {
        setToast(event);
        if (sound) {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          gain.gain.value = 0.025;
          oscillator.frequency.value =
            event.type === "incident.created" ? 660 : 440;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.12);
          oscillator.onended = () => void context.close();
        }
      }
      seen.current = event.eventId;
    }
  }, [city.events]);
  useEffect(() => {
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast?.eventId]);
  const incident =
    city.incidents.find((i) => i.id === selected) ||
    city.incidents.find((i) => !ended(i)) ||
    city.incidents.at(-1);
  const ambulance = city.ambulances.find((a) => a.id === incident?.ambulanceId),
    hospital = city.hospitals.find((h) => h.id === incident?.hospitalId),
    route = city.routes.find((r) => r.id === incident?.routeId),
    corridor = city.corridors.find((c) => c.id === incident?.corridorId);
  const live = city.incidents.filter((i) => !ended(i));
  const config = city.simulationControl;
  const searchResults = useMemo(
    () =>
      [
        ...city.incidents.map((i) => ({
          kind: "incident",
          id: i.id,
          name: i.id + " " + (i.district || "") + " " + i.emergencyType,
        })),
        ...city.ambulances.map((a) => ({
          kind: "ambulance",
          id: a.id,
          name: a.id + " " + (a.driverName || "") + " " + a.status,
        })),
        ...city.hospitals.map((h) => ({
          kind: "hospital",
          id: h.id,
          name: h.name + " " + h.id,
        })),
        ...city.cameras.map((c) => ({
          kind: "camera",
          id: c.id,
          name: c.id + " " + c.name,
        })),
        ...city.roadEvents.map((r) => ({
          kind: "road",
          id: r.id,
          name: r.type + " " + r.description,
        })),
      ]
        .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 18),
    [city.revision, search],
  );
  const alerts = city.events
    .filter(
      (e) =>
        /road\.|camera\.|hospital.rejected|dispatch.unavailable|route.unavailable|incident.created/.test(
          e.type,
        ) && city.alertStatus?.[e.eventId] !== "resolve",
    )
    .slice(-30)
    .reverse();
  const focusAmb =
    focus?.kind === "ambulance"
      ? city.ambulances.find((a) => a.id === focus.id)
      : undefined;
  const focusHospital =
    focus?.kind === "hospital"
      ? city.hospitals.find((h) => h.id === focus.id)
      : undefined;
  const focusCamera =
    focus?.kind === "camera"
      ? city.cameras.find((c) => c.id === focus.id)
      : undefined;
  const focusRoad =
    focus?.kind === "road"
      ? city.roadEvents.find((r) => r.id === focus.id)
      : undefined;
  const simulationEngine = new SimulationEngine(action);
  const simulationEvent = (kind: string) =>
    simulationEngine.trigger(kind, incident?.id);
  async function login() {
    setBusy(true);
    try {
      await core("/api/auth/session", {
        role: "CONTROL_ROOM_OPERATOR",
        key: loginKey,
      });
      await queryClient.invalidateQueries({ queryKey: ["command-session"] });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createIncident() {
    const result = (await action("/api/incidents", {
      submissionId: crypto.randomUUID(),
      patientName: patient,
      location: { latitude: Number(lat), longitude: Number(lon) },
      emergencyType: type,
      severity,
      description: notes,
      district,
      patientCount,
      dispatchImmediately: false,
    })) as { incidentId: string; trackingLink: string } | undefined;
    if (result) {
      select(result.incidentId);
      setCreate(false);
      await navigator.clipboard
        .writeText(location.origin + result.trackingLink)
        .catch(() => {});
      setError(
        "Tracking link created and copied. Delivery requires operator sharing.",
      );
    }
  }
  const command = (kind: string, body: unknown = {}) =>
    incident && action(`/api/command/incidents/${incident.id}/${kind}`, body);
  const telemetry = [
    {
      name: "AVAILABLE",
      value: city.ambulances.filter((a) => a.status === "AVAILABLE").length,
    },
    {
      name: "ASSIGNED",
      value: city.ambulances.filter((a) => a.status === "ASSIGNED").length,
    },
    {
      name: "EN ROUTE",
      value: city.ambulances.filter((a) => a.status.includes("EN_ROUTE"))
        .length,
    },
    {
      name: "COMPLETE",
      value: city.incidents.filter((i) => i.status === "COMPLETED").length,
    },
  ];
  if (!session.data)
    return (
      <div className="command-login">
        <Shield size={45} />
        <span className="command-eyebrow">AEGIS · EMERGENCY RESPONSE</span>
        <h1>Emergency command center</h1>
        <p>One live city network. One connected emergency lifecycle.</p>
        {session.isPending ? (
          <p>Connecting to the shared command API…</p>
        ) : (
          <>
            <label>
              Operational key
              <input
                type="password"
                value={loginKey}
                onChange={(e) => setLoginKey(e.target.value)}
              />
            </label>
            <button onClick={() => void login()} disabled={busy}>
              Open command room
            </button>
            <button onClick={() => void login()} disabled={busy}>
              Enter demo workspace
            </button>
            <small>
              Demo sign-in requires an available backend with demo mode enabled.
            </small>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <a href="/citizen">Citizen emergency tracking →</a>
      </div>
    );
  if (
    !["CONTROL_ROOM_OPERATOR", "SYSTEM_ADMIN"].includes(session.data.user.role)
  )
    return (
      <div className="command-login">
        <h1>Command room access required</h1>
        <a
          href={
            session.data.user.role === "AMBULANCE_DRIVER"
              ? "/driver"
              : "/hospital"
          }
        >
          Open your assigned workspace
        </a>
        <button
          onClick={async () => {
            await core("/api/auth/session", undefined, "DELETE");
            location.reload();
          }}
        >
          Switch operator session
        </button>
      </div>
    );
  return (
    <div
      className={
        "command-center " +
        (!leftOpen ? "left-collapsed " : "") +
        (!rightOpen ? "right-collapsed" : "")
      }
    >
      <AnimatePresence>
        {intro && (
          <motion.div className="command-boot" exit={{ opacity: 0 }}>
            <Shield size={58} />
            <h1>AEGIS</h1>
            <p>INITIALIZING EMERGENCY INTELLIGENCE NETWORK</p>
            {[
              "COMMAND API",
              "AMBULANCE NETWORK",
              "HOSPITAL NETWORK",
              "ROAD INTELLIGENCE",
              "CAMERA SERVICE",
              "SIGNAL SIMULATION",
            ].map((l, n) => (
              <motion.div
                key={l}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: n * 0.25 }}
              >
                {l}
                <span>
                  {connection === "ONLINE" ? "CONNECTED" : "CONNECTING"}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <header className="command-top">
        <div className="command-brand">
          <Shield size={27} />
          <div>
            <b>AEGIS</b>
            <small>EMERGENCY COMMAND CENTER</small>
          </div>
        </div>
        <div className="command-status">
          <span
            className={"live-dot " + (connection !== "ONLINE" ? "amber" : "")}
          />
          {connection === "ONLINE" ? "SYSTEM ONLINE" : "RECONNECTING"}
        </div>
        <div className="top-metrics">
          {[
            ["ACTIVE", live.length],
            [
              "AVAILABLE",
              city.ambulances.filter((a) => a.status === "AVAILABLE").length,
            ],
            [
              "EN ROUTE",
              city.ambulances.filter((a) => a.status.includes("EN_ROUTE"))
                .length,
            ],
            ["CRITICAL", live.filter((i) => i.severity === "CRITICAL").length],
            ["HOSPITALS", city.hospitals.filter((h) => h.erAvailable).length],
            ["ROAD ALERTS", city.roadEvents.filter((r) => r.active).length],
            [
              "CORRIDORS",
              city.corridors.filter((c) => c.status === "ACTIVE").length,
            ],
          ].map(([name, value]) => (
            <div key={name}>
              <small>{name}</small>
              <motion.b
                key={String(value)}
                initial={{ opacity: 0.5, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {String(value).padStart(2, "0")}
              </motion.b>
            </div>
          ))}
        </div>
        <div className="top-operator">
          <span>
            {city.cityName || "CITY"} COMMAND
            <small>
              {time.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
            </small>
          </span>
          <button
            aria-label="Notifications"
            onClick={() => setNotifications((v) => !v)}
          >
            <Bell size={18} />
            <i>{alerts.length}</i>
          </button>
          <button
            aria-label="Sign out"
            onClick={async () => {
              await core("/api/auth/session", undefined, "DELETE");
              location.reload();
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="command-toolbar">
        <button onClick={() => toggle("left")} title="Collapse left panel">
          <PanelLeftClose size={17} />
        </button>
        <button className="search-command" onClick={() => setPalette(true)}>
          <Search size={16} />
          Search city network<kbd>⌘ / Ctrl K</kbd>
        </button>
        <span className="demo-live">
          <span className="live-dot" />
          {config?.running ? "DEMO LIVE" : "DEMO PAUSED"}
        </span>
        <div className="simulation-controls">
          <button
            disabled={busy}
            onClick={() =>
              void action(
                config ? "/api/demo/control" : "/api/demo/start",
                config ? { running: !config.running } : {},
                config ? "PATCH" : "POST",
              )
            }
          >
            {config?.running ? <Pause size={14} /> : <Play size={14} />}{" "}
            {config?.running ? "Pause" : "Start demo"}
          </button>
          {[1, 2, 5].map((speed) => (
            <button
              key={speed}
              disabled={busy || !config}
              className={config?.speed === speed ? "active" : ""}
              onClick={() =>
                void action("/api/demo/control", { speed }, "PATCH")
              }
            >
              {speed}X
            </button>
          ))}
          <button
            disabled={busy || !config}
            className={config?.auto ? "active" : ""}
            onClick={() =>
              void action("/api/demo/control", { auto: !config?.auto }, "PATCH")
            }
          >
            AUTO
          </button>
          <button
            disabled={busy || !config}
            className={config?.chaos ? "danger active" : "danger"}
            onClick={() =>
              void action(
                "/api/demo/control",
                { chaos: !config?.chaos },
                "PATCH",
              )
            }
          >
            CHAOS
          </button>
          <button
            title="Reset command demo"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Reset simulated city? Non-demo active incidents prevent reset.",
                )
              )
                void action("/api/demo/reset");
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <button aria-label="Mute sounds" onClick={() => setSound((v) => !v)}>
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button
          title="Full screen operations"
          onClick={() => {
            if (!document.fullscreenElement)
              void document.documentElement.requestFullscreen();
            else void document.exitFullscreen();
          }}
        >
          <Maximize size={16} />
        </button>
        <button title="Collapse right panel" onClick={() => toggle("right")}>
          <PanelRightClose size={17} />
        </button>
      </div>
      {error && (
        <div className="command-error" role="alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      <aside className="command-left">
        <nav>
          {NAV.map(([name, Icon]) => (
            <button
              className={tab === name ? "active" : ""}
              key={name}
              onClick={() => setTab(name)}
            >
              <Icon size={15} />
              {name}
            </button>
          ))}
        </nav>
        <div className="list-heading">
          <span>ACTIVE EMERGENCIES</span>
          <button title="Create emergency" onClick={() => setCreate(true)}>
            <Plus size={17} />
          </button>
        </div>
        <div className="incident-list">
          {live.length ? (
            live.map((i) => (
              <button
                key={i.id}
                className={
                  "incident-card " + (incident?.id === i.id ? "selected" : "")
                }
                onClick={() => select(i.id)}
              >
                <div>
                  <span className={"priority " + i.severity.toLowerCase()}>
                    {i.severity === "CRITICAL" ? "P1" : "P2"} {i.severity}
                  </span>
                  <small>{duration(i.etaSeconds)}</small>
                </div>
                <b>{readable(i.emergencyType)}</b>
                <span>{i.district || "Confirmed pickup"}</span>
                <small>
                  {i.id} · {i.ambulanceId || "Dispatch required"}
                </small>
                <div className="incident-card-status">
                  <span className="live-dot" />
                  {readable(i.status)}
                </div>
              </button>
            ))
          ) : (
            <div className="stable-city">
              <Check size={25} />
              <b>CITY STATUS STABLE</b>
              <p>
                No active priority emergencies. Network monitoring continues.
              </p>
            </div>
          )}
        </div>
        <button className="create-command" onClick={() => setCreate(true)}>
          <Plus size={16} />
          Create emergency
        </button>
      </aside>
      <main className="command-main">
        <div className="main-view-heading">
          <div>
            <span className="command-eyebrow">
              AEGIS · FASTEST PATH TO SURVIVAL
            </span>
            <h1>{tab}</h1>
          </div>
          <small>
            REV {city.revision} · <span className="live-dot" /> {connection}
          </small>
        </div>
        {["Live Operations", "Active Incidents"].includes(tab) ? (
          <>
            <CommandMap />
            <div className="demo-generator">
              <span>DEMO EVENTS</span>
              {[
                "ACCIDENT",
                "CARDIAC",
                "TRAFFIC",
                "ROADBLOCK",
                "CONSTRUCTION",
                "ICU_FULL",
                "CAMERA_ALERT",
                "MULTI_INCIDENT",
                "GREEN_CORRIDOR",
              ].map((kind) => (
                <button
                  key={kind}
                  disabled={busy || !config}
                  onClick={() => void simulationEvent(kind)}
                >
                  + {readable(kind)}
                </button>
              ))}
            </div>
          </>
        ) : tab === "Camera AI" ? (
          <>
            <div className="camera-grid">
              {city.cameras.map((c) => (
                <button
                  key={c.id}
                  className="camera-tile"
                  onClick={() => setCamera(c.id)}
                >
                  <div className="camera-preview">
                    <Camera size={30} />
                    <span>
                      DEMO SENSOR · {c.detection?.type || "AWAITING VIDEO"}
                    </span>
                    <i className="camera-scan" />
                  </div>
                  <b>
                    {c.id} · {c.name}
                  </b>
                  <small>
                    {c.detection
                      ? `${c.detection.vehicleQueue} queued · ${c.detection.averageSpeedKph} km/h · SIMULATED`
                      : "Open live vision / upload test footage"}
                  </small>
                </button>
              ))}
            </div>
          </>
        ) : tab === "Ambulance Fleet" ? (
          <div className="network-cards">
            {city.ambulances.map((a) => (
              <button key={a.id} onClick={() => setFocus("ambulance", a.id)}>
                <Ambulance size={23} />
                <b>{a.id}</b>
                <span
                  className={
                    a.status === "AVAILABLE" ? "text-green" : "text-cyan"
                  }
                >
                  {readable(a.status)}
                </span>
                <small>
                  {a.driverName || a.driverId} · {a.type || "EMS"}
                </small>
                <small>
                  {a.speed.toFixed(0)} km/h · fuel {a.fuel ?? "—"}%
                </small>
              </button>
            ))}
          </div>
        ) : tab === "Hospital Network" ? (
          <div className="network-cards">
            {city.hospitals.map((h) => (
              <button key={h.id} onClick={() => setFocus("hospital", h.id)}>
                <Hospital size={23} />
                <b>{h.name}</b>
                <span>
                  {Math.max(0, h.icuBeds - h.reservations.length)} ICU available
                </span>
                <small>
                  {h.doctors} doctors · {h.workload}% demo load
                </small>
                <div className="capacity-meter">
                  <i style={{ width: h.workload + "%" }} />
                </div>
                <small>{h.specialists.join(" · ")}</small>
              </button>
            ))}
          </div>
        ) : tab === "Road Intelligence" ? (
          <div className="network-cards">
            {city.roadEvents
              .filter((r) => r.active)
              .map((r) => (
                <div key={r.id}>
                  <TriangleAlert size={23} />
                  <b>{readable(r.type)}</b>
                  <p>{r.description}</p>
                  <small>
                    {r.source} · {r.affectedIncidentIds.length} impacted
                    journeys
                  </small>
                  {r.evidenceImage && (
                    <img src={r.evidenceImage} alt="Captured road evidence" />
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(
                        "/api/road-events/" + r.id,
                        { active: false },
                        "PATCH",
                      )
                    }
                  >
                    Confirm road cleared
                  </button>
                  <button
                    onClick={() => {
                      setFocus("road", r.id);
                      setTab("Live Operations");
                    }}
                  >
                    Open on map
                  </button>
                </div>
              ))}
          </div>
        ) : tab === "Green Corridor" ? (
          <div className="network-cards">
            {city.corridors.map((c) => (
              <div key={c.id}>
                <Radio size={24} />
                <b>{c.id}</b>
                <span className="text-green">{c.status}</span>
                <small>
                  {c.incidentId} · revision {c.version}
                </small>
                <div className="signal-wave">
                  {c.signals.map((s) => (
                    <span
                      key={s.id}
                      className={s.state.toLowerCase()}
                      title={s.priority}
                    >
                      {s.state}
                      <small>{duration(s.etaSeconds)}</small>
                    </span>
                  ))}
                </div>
                <small>DEMO signal windows · {c.signals.length} signals</small>
                <button
                  onClick={() => {
                    select(c.incidentId);
                    setTab("Live Operations");
                  }}
                >
                  View corridor route
                </button>
              </div>
            ))}
          </div>
        ) : tab === "Analytics" ? (
          <div className="analytics-command">
            <h2>Live operational outcomes</h2>
            <div className="analytics-metrics">
              <div>
                <b>
                  {
                    city.incidents.filter((i) => i.status === "COMPLETED")
                      .length
                  }
                </b>
                Completed incidents
              </div>
              <div>
                <b>
                  {
                    city.events.filter((e) => e.type === "route.rerouted")
                      .length
                  }
                </b>
                Route recomputations
              </div>
              <div>
                <b>
                  {city.corridors.filter((c) => c.status === "ACTIVE").length}
                </b>
                Active corridors
              </div>
              <div>
                <b>{live.filter((i) => i.severity === "CRITICAL").length}</b>
                Active critical incidents
              </div>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={telemetry}>
                  <CartesianGrid stroke="#1b2a37" vertical={false} />
                  <XAxis dataKey="name" stroke="#8193a6" />
                  <YAxis stroke="#8193a6" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#101720",
                      borderColor: "#273645",
                    }}
                  />
                  <Bar dataKey="value" fill="#3ed1ed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p>
              Counts derive from the shared event history. Corridor savings are
              simulated provider estimates, not patient survival outcomes.
            </p>
          </div>
        ) : tab === "System Health" ? (
          <div className="network-cards">
            {Object.entries(health.data?.services || {}).map(
              ([name, status]) => (
                <div key={name}>
                  <HeartPulse size={22} />
                  <b>{name}</b>
                  <span
                    className={status === "ONLINE" ? "text-green" : "text-cyan"}
                  >
                    {status}
                  </span>
                </div>
              ),
            )}
            <div>
              <Activity size={22} />
              <b>Command WebSocket</b>
              <span>{connection}</span>
              <small>Last city revision {city.revision}</small>
            </div>
          </div>
        ) : (
          <div className="history-command">
            {(tab === "AI Intelligence"
              ? alerts
              : city.events.slice(-100).reverse()
            ).map((e) => (
              <div key={e.eventId}>
                <span>{new Date(e.occurredAt).toLocaleTimeString()}</span>
                <b>{label(e)}</b>
                <small>{e.incidentId || "CITY NETWORK"}</small>
                {typeof e.details.reason === "string" && (
                  <p>{e.details.reason}</p>
                )}
                <button
                  onClick={() => {
                    if (e.incidentId) select(e.incidentId);
                    setTab("Live Operations");
                  }}
                >
                  Open source <ChevronRight size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <aside className="command-right">
        <div className="intelligence-heading">
          <Brain size={19} />
          <b>EMERGENCY INTELLIGENCE</b>
          <span className="live-dot" />
        </div>
        {focusAmb && (
          <section>
            <div className="section-heading">
              <Ambulance size={16} />
              {focusAmb.id}
            </div>
            <b>{readable(focusAmb.status)}</b>
            <p>
              {focusAmb.driverName || focusAmb.driverId} ·{" "}
              {focusAmb.vehicleNumber || focusAmb.id}
            </p>
            <p>{focusAmb.equipment.join(" · ")}</p>
            <small>
              {focusAmb.speed.toFixed(0)} km/h · {focusAmb.heading.toFixed(0)}°
            </small>
            {["AVAILABLE", "OFFLINE"].includes(focusAmb.status) && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(`/api/ambulances/${focusAmb.id}/status`, {
                    status:
                      focusAmb.status === "OFFLINE" ? "AVAILABLE" : "OFFLINE",
                  })
                }
              >
                {focusAmb.status === "OFFLINE"
                  ? "Restore available status"
                  : "Mark unit offline"}
              </button>
            )}
            <button
              onClick={() => {
                const i = city.incidents.find(
                  (i) => i.ambulanceId === focusAmb.id && !ended(i),
                );
                if (i) {
                  select(i.id);
                  setTab("Live Operations");
                } else setError("This unit has no active incident route.");
              }}
            >
              View route
            </button>
          </section>
        )}
        {focusHospital && (
          <section>
            <div className="section-heading">
              <Hospital size={16} />
              {focusHospital.name}
            </div>
            <p>
              {focusHospital.icuBeds - focusHospital.reservations.length} ICU ·{" "}
              {focusHospital.traumaBeds} trauma beds
            </p>
            <p>{focusHospital.specialists.join(" · ")}</p>
            <p>{focusHospital.equipment.join(" · ")}</p>
            <button
              onClick={() => {
                if (incident)
                  void command("hospital", { hospitalId: focusHospital.id });
              }}
              disabled={busy || !incident}
            >
              Select for current patient
            </button>
            <a href="/hospital" target="_blank" rel="noreferrer">
              Open hospital workspace <ExternalLink size={12} />
            </a>
          </section>
        )}
        {focusCamera && (
          <section>
            <div className="section-heading">
              <Camera size={16} />
              {focusCamera.id}
            </div>
            <p>{focusCamera.name}</p>
            <small>
              {focusCamera.detection
                ? "Simulated " + focusCamera.detection.type
                : "Real vision available when video is played"}
            </small>
            <button onClick={() => setCamera(focusCamera.id)}>
              View camera & evidence
            </button>
          </section>
        )}
        {focusRoad && (
          <section>
            <div className="section-heading">
              <TriangleAlert size={16} />
              {readable(focusRoad.type)}
            </div>
            <p>{focusRoad.description}</p>
            <small>
              {focusRoad.affectedIncidentIds.length} affected incidents
            </small>
            <button
              disabled={busy}
              onClick={() =>
                void action(
                  "/api/road-events/" + focusRoad.id,
                  { active: false },
                  "PATCH",
                )
              }
            >
              Confirm cleared
            </button>
          </section>
        )}
        {incident ? (
          <>
            <section>
              <div className="section-heading">
                <Activity size={15} />
                SELECTED INCIDENT
                <span className={"priority " + incident.severity.toLowerCase()}>
                  {incident.severity}
                </span>
              </div>
              <h2>{readable(incident.emergencyType)}</h2>
              <small>
                {incident.id} · {incident.district || "Confirmed pickup"}
              </small>
              <small>
                Patients: {incident.patientCount || 1} ·{" "}
                {Object.entries(incident.vitals)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ") || "Vitals not yet recorded"}
              </small>
              <p
                className="incident-state"
                data-testid="command-incident-status"
              >
                {readable(incident.status)}
              </p>
              <div className="incident-facts">
                <div>
                  <small>UNIT</small>
                  <b>{ambulance?.id || "Pending"}</b>
                </div>
                <div>
                  <small>ETA</small>
                  <b data-testid="command-eta">
                    {duration(incident.etaSeconds)}
                  </b>
                </div>
                <div>
                  <small>HOSPITAL</small>
                  <b>{hospital?.name || "After pickup"}</b>
                </div>
                <div>
                  <small>REMAINING</small>
                  <b>
                    {incident.distanceMeters == null
                      ? "—"
                      : (incident.distanceMeters / 1000).toFixed(1) + " km"}
                  </b>
                </div>
              </div>
              <div className="command-action-grid">
                <button
                  disabled={
                    busy ||
                    !["CREATED", "CRITICAL_ESCALATION"].includes(
                      incident.status,
                    )
                  }
                  onClick={() => void command("dispatch")}
                >
                  Accept AI dispatch
                </button>
                <button
                  disabled={busy || incident.status !== "DRIVER_NOTIFIED"}
                  onClick={() => void command("reassign")}
                >
                  Reassign unit
                </button>
                <button
                  disabled={busy || !route || ended(incident)}
                  onClick={() =>
                    void action(`/api/incidents/${incident.id}/reroute`)
                  }
                >
                  Recompute route
                </button>
                <button
                  disabled={busy || !ambulance || ended(incident)}
                  onClick={() => void command("contact")}
                >
                  Contact driver
                </button>
                <button
                  disabled={busy || !hospital || ended(incident)}
                  onClick={() => void command("hospital-alert")}
                >
                  Send hospital alert
                </button>
                <button
                  className="danger"
                  disabled={busy || ended(incident)}
                  onClick={() => {
                    if (confirm("Cancel this emergency and release resources?"))
                      void action(`/api/incidents/${incident.id}/cancel`);
                  }}
                >
                  Cancel emergency
                </button>
              </div>
              <small>
                Contact requests enter the shared operator timeline;
                SMS/WhatsApp delivery is not simulated as sent.
              </small>
            </section>
            <section>
              <div className="section-heading">
                <Route size={15} />
                ROUTE EXPLANATION
              </div>
              {route ? (
                <>
                  <p>
                    {route.candidateId} · {route.provider}
                  </p>
                  {route.reasons.map((r, n) => (
                    <small className="reason" key={n}>
                      <Check size={12} />
                      {r}
                    </small>
                  ))}
                  {route.blocked && (
                    <b className="text-red">NO ACCESSIBLE ALTERNATIVE</b>
                  )}
                </>
              ) : (
                <p>Awaiting driver acceptance.</p>
              )}
            </section>
            <section>
              <div className="section-heading">
                <Ambulance size={15} />
                DISPATCH ELIGIBILITY
              </div>
              {incident.dispatchCandidates?.slice(0, 3).map((c) => (
                <div className="shortlist" key={c.ambulanceId}>
                  <b>
                    {c.ambulanceId}
                    <span>
                      {c.eligible
                        ? `${c.normalizedScore ?? "—"}/100 · ${duration(c.etaSeconds)}`
                        : "EXCLUDED"}
                    </span>
                  </b>
                  <small>
                    {(c.eligible ? c.reasons : c.exclusionReasons).join(" · ")}
                  </small>
                  {incident.status === "CREATED" && (
                    <button
                      disabled={busy || !c.eligible}
                      onClick={() =>
                        void command("dispatch", { ambulanceId: c.ambulanceId })
                      }
                    >
                      Dispatch {c.ambulanceId}
                    </button>
                  )}
                </div>
              ))}
            </section>
            <section>
              <div className="section-heading">
                <Hospital size={15} />
                CLINICALLY SUITABLE DESTINATIONS
              </div>
              {incident.hospitalRankings?.slice(0, 3).map((h) => (
                <div className="shortlist" key={h.hospitalId}>
                  <b>
                    {h.name}
                    <span>{h.score}/100</span>
                  </b>
                  <small>
                    {h.eligible
                      ? h.reasons.join(" · ")
                      : h.exclusionReasons.join(" · ")}
                  </small>
                  <small>
                    ETA {duration(h.etaSeconds)} · ICU {h.availableIcuBeds}
                  </small>
                  <button
                    disabled={busy || !h.eligible || ended(incident)}
                    onClick={() =>
                      void command("hospital", { hospitalId: h.hospitalId })
                    }
                  >
                    Select destination
                  </button>
                </div>
              )) || <p>Ranking starts after patient pickup.</p>}
            </section>
            <section>
              <div className="section-heading">
                <Radio size={15} />
                GREEN CORRIDOR
              </div>
              <p className="text-green">
                {corridor?.status || "HOSPITAL ACCEPTANCE REQUIRED"}
              </p>
              {corridor && (
                <div className="signal-wave">
                  {corridor.signals.map((s) => (
                    <span
                      key={s.id}
                      className={s.state.toLowerCase()}
                      title={`${s.priority} · ${s.windowSeconds}s`}
                    >
                      ●<small>{duration(s.etaSeconds)}</small>
                    </span>
                  ))}
                </div>
              )}
              <div className="command-action-grid">
                <button
                  disabled={busy || incident.status !== "EN_ROUTE_TO_HOSPITAL"}
                  onClick={() => void command("corridor")}
                >
                  Activate corridor
                </button>
                <button
                  disabled={busy || !corridor || corridor.status !== "ACTIVE"}
                  onClick={() => void command("cancel-corridor")}
                >
                  Release corridor
                </button>
              </div>
              <small>Simulated controller · route-specific green windows</small>
            </section>
            {hospital && (
              <section>
                <div className="section-heading">
                  <Radio size={15} /> HOSPITAL COMMAND LINK
                </div>
                <div className="journey-timeline">
                  {(
                    (
                      city as City & {
                        hospitalOperations?: Record<
                          string,
                          {
                            messages: {
                              id: string;
                              incidentId: string;
                              text: string;
                              sender: string;
                              channel: string;
                            }[];
                          }
                        >;
                      }
                    ).hospitalOperations?.[hospital.id]?.messages || []
                  )
                    .filter(
                      (m) =>
                        m.incidentId === incident.id && m.channel === "COMMAND",
                    )
                    .slice(-5)
                    .map((m) => (
                      <p key={m.id}>
                        <b>{m.sender}</b>
                        <br />
                        {m.text}
                      </p>
                    ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void command("hospital-message", {
                      text: hospitalMessage,
                    })?.then(() => setHospitalMessage(""));
                  }}
                >
                  <input
                    aria-label="Message hospital team"
                    placeholder="Send receiving-team update…"
                    maxLength={2000}
                    value={hospitalMessage}
                    onChange={(e) => setHospitalMessage(e.target.value)}
                  />
                  <button disabled={busy || !hospitalMessage.trim()}>
                    Send hospital message
                  </button>
                </form>
              </section>
            )}
            <section>
              <div className="section-heading">
                <Clock size={15} />
                PATIENT JOURNEY
              </div>
              <div className="journey-timeline">
                {incident.timeline
                  .filter(
                    (e) =>
                      ![
                        "ambulance.location.updated",
                        "route.eta.updated",
                        "green_corridor.updated",
                        "hospital.rankings.updated",
                      ].includes(e.type),
                  )
                  .slice(-12)
                  .map((e) => (
                    <div key={e.eventId}>
                      <i />
                      <b>{label(e)}</b>
                      <small>
                        {new Date(e.occurredAt).toLocaleTimeString()}
                      </small>
                    </div>
                  ))}
              </div>
              {ended(incident) && (
                <div className="mission-complete">
                  <Check size={22} />
                  <b>
                    {incident.status === "COMPLETED"
                      ? "PATIENT DELIVERED"
                      : "EMERGENCY CANCELLED"}
                  </b>
                  {incident.completionReport && (
                    <>
                      <b>
                        Demo response{" "}
                        {duration(incident.completionReport.responseSeconds)}
                      </b>
                      <small>
                        Estimated corridor benefit{" "}
                        {duration(
                          incident.completionReport.corridorEstimateSeconds,
                        )}{" "}
                        · {incident.completionReport.routeRecomputations} route
                        versions
                      </small>
                    </>
                  )}
                  <small>
                    Recorded lifecycle and provider estimates preserved in
                    timeline.
                  </small>
                </div>
              )}
            </section>
          </>
        ) : (
          <section>
            <p>Choose an emergency to inspect its live journey.</p>
          </section>
        )}
      </aside>
      <footer className="command-stream">
        <span>
          <Radio size={14} /> LIVE EVENT STREAM
        </span>
        <div>
          {city.events
            .filter(
              (e) =>
                ![
                  "ambulance.location.updated",
                  "route.eta.updated",
                  "green_corridor.updated",
                  "hospital.rankings.updated",
                ].includes(e.type),
            )
            .slice(-8)
            .reverse()
            .map((e) => (
              <motion.button
                key={e.eventId}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => {
                  if (e.incidentId) select(e.incidentId);
                  setTab("Event History");
                }}
              >
                <time>{new Date(e.occurredAt).toLocaleTimeString()}</time>
                {label(e)}
              </motion.button>
            ))}
        </div>
      </footer>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="command-toast"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Activity size={18} />
            <div>
              <b>{label(toast)}</b>
              <small>{toast.incidentId || "HYDERABAD DEMO NETWORK"}</small>
            </div>
            <button onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {palette && (
        <div
          className="command-modal-backdrop"
          onClick={() => setPalette(false)}
        >
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <div>
              <Search size={20} />
              <input
                autoFocus
                placeholder="Search incidents, units, hospitals, cameras…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button onClick={() => setPalette(false)}>
                <X size={18} />
              </button>
            </div>
            {!search && (
              <div className="palette-actions">
                <button
                  onClick={() => {
                    setPalette(false);
                    setCreate(true);
                  }}
                >
                  <Plus size={15} />
                  Create emergency
                </button>
                <button
                  onClick={() => {
                    void action("/api/demo/start");
                    setPalette(false);
                  }}
                >
                  <Play size={15} />
                  Start simulation
                </button>
                <button
                  onClick={() => {
                    void action(
                      "/api/demo/control",
                      { running: false },
                      "PATCH",
                    );
                    setPalette(false);
                  }}
                >
                  <Pause size={15} />
                  Pause simulation
                </button>
                <button
                  onClick={() => {
                    setLayer("CAMERAS");
                    setPalette(false);
                  }}
                >
                  <Camera size={15} />
                  Camera map layer
                </button>
                <button
                  onClick={() => {
                    setTab("AI Intelligence");
                    setPalette(false);
                  }}
                >
                  <Brain size={15} />
                  Open AI intelligence
                </button>
              </div>
            )}
            <div className="palette-results">
              {searchResults.map((r) => (
                <button
                  key={r.kind + r.id}
                  onClick={() => {
                    if (r.kind === "incident") select(r.id);
                    else setFocus(r.kind, r.id);
                    setTab("Live Operations");
                    setPalette(false);
                  }}
                >
                  <small>{r.kind.toUpperCase()}</small>
                  {r.name}
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {create && (
        <div className="command-modal-backdrop">
          <form
            className="create-emergency-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void createIncident();
            }}
          >
            <div className="section-heading">
              <Plus size={18} />
              <h2>Create emergency</h2>
              <button type="button" onClick={() => setCreate(false)}>
                <X size={18} />
              </button>
            </div>
            <p>Confirmed operator input · capability-based dispatch</p>
            <label>
              Patient / caller
              <input
                required
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                Emergency type
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {[
                    "ROAD_ACCIDENT",
                    "CARDIAC",
                    "STROKE",
                    "BREATHING",
                    "INJURY",
                    "OTHER",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Confirmed severity
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  {["CRITICAL", "HIGH", "MODERATE", "LOW"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Location label
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </label>
              <label>
                Patient count
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={patientCount}
                  onChange={(e) => setPatientCount(Number(e.target.value))}
                />
              </label>
              <label>
                Latitude
                <input
                  required
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  required
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                />
              </label>
            </div>
            <label>
              Symptoms / access notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <small>
              Caller severity is confirmed input, not an AI diagnosis or
              calibrated survival probability.
            </small>
            <button className="primary" disabled={busy}>
              Create & run AI dispatch
            </button>
          </form>
        </div>
      )}
      {notifications && (
        <div className="notification-drawer">
          <div className="section-heading">
            <Bell size={18} />
            ALERT CENTER
            <button onClick={() => setNotifications(false)}>
              <X size={18} />
            </button>
          </div>
          {alerts.map((e) => (
            <div className="alert-card" key={e.eventId}>
              <b>{label(e)}</b>
              <small>
                {e.incidentId || "CITY"} ·{" "}
                {new Date(e.occurredAt).toLocaleTimeString()}
              </small>
              <div className="command-action-grid">
                {["acknowledge", "mute", "resolve"].map((a) => (
                  <button
                    key={a}
                    disabled={busy || city.alertStatus?.[e.eventId] === a}
                    onClick={() =>
                      void action(`/api/command/alerts/${e.eventId}/${a}`)
                    }
                  >
                    {a}
                  </button>
                ))}
                <button
                  onClick={() => {
                    if (e.incidentId) select(e.incidentId);
                    setTab("Event History");
                    setNotifications(false);
                  }}
                >
                  Open source
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {camera && (
        <div className="command-modal-backdrop">
          <div className="camera-modal">
            <div className="section-heading">
              <Camera size={18} />
              {city.cameras.find((c) => c.id === camera)?.name || camera}
              <button onClick={() => setCamera("")}>
                <X size={20} />
              </button>
            </div>
            <p>
              Uploaded footage uses actual live perception. Demo camera
              detections are explicitly simulated.
            </p>
            <DemoCameraFeed
              name={camera}
              construction={
                !!city.cameras.find((c) => c.id === camera)?.detection
              }
            />
            <div className="vision-surface">
              <RoadVision cameraId={camera} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
