import { memo, useEffect, useRef, useState } from "react";
import {
  Ambulance as AmbulanceIcon,
  Hospital,
  Camera,
  TriangleAlert,
  Navigation,
  Maximize,
  Layers,
  LocateFixed,
} from "lucide-react";
import { useCommandStore } from "../stores/command";
import { GoogleCityMap } from "../GoogleCityMap";
import type { Point, Ambulance } from "../services/ecosystem";
const MovingUnit = memo(function MovingUnit({
  unit,
  xy,
  onClick,
}: {
  unit: Ambulance;
  xy: (p: Point) => { x: number; y: number };
  onClick: () => void;
}) {
  const element = useRef<HTMLButtonElement>(null);
  const previous = useRef(xy(unit.location));
  const target = xy(unit.location);
  useEffect(() => {
    const origin = previous.current;
    let frame = 0;
    const start = performance.now();
    function draw(t: number) {
      const progress = Math.min(1, (t - start) / 900);
      const p = {
        x: origin.x + (target.x - origin.x) * progress,
        y: origin.y + (target.y - origin.y) * progress,
      };
      if (element.current) {
        element.current.style.left = p.x + "%";
        element.current.style.top = p.y + "%";
      }
      previous.current = p;
      if (progress < 1) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [target.x, target.y]);
  return (
    <button
      ref={element}
      className={
        "unit-node " +
        (unit.status === "OFFLINE"
          ? "offline"
          : unit.status === "AVAILABLE"
            ? "available"
            : unit.status.includes("HOSPITAL")
              ? "critical"
              : "assigned")
      }
      style={{ left: target.x + "%", top: target.y + "%" }}
      title={unit.id + " " + unit.status}
      onClick={onClick}
    >
      <span
        className="unit-direction"
        style={{ transform: `rotate(${unit.heading}deg)` }}
      >
        <Navigation size={10} />
      </span>
      <AmbulanceIcon size={19} />
      <span>{unit.id}</span>
    </button>
  );
});
export function CommandMap() {
  const { city, selected, focus, layer, select, setFocus, setLayer } =
    useCommandStore();
  const [googleFailed, setGoogleFailed] = useState(false),
    [zoom, setZoom] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const incident =
    city.incidents.find((i) => i.id === selected) ||
    city.incidents.find((i) => !["COMPLETED", "CANCELLED"].includes(i.status));
  const all = [
    ...city.ambulances.map((a) => a.location),
    ...city.hospitals.map((h) => h.location),
    ...city.cameras.map((c) => c.location),
    ...city.incidents.map((i) => i.location),
    ...city.routes.flatMap((r) => r.geometry),
  ];
  const bounds = useRef({
    minLat: 17.32,
    maxLat: 17.51,
    minLon: 78.31,
    maxLon: 78.59,
  });
  if (all.length && !city.simulationControl) {
    bounds.current = {
      minLat: Math.min(...all.map((p) => p.latitude)) - 0.008,
      maxLat: Math.max(...all.map((p) => p.latitude)) + 0.008,
      minLon: Math.min(...all.map((p) => p.longitude)) - 0.008,
      maxLon: Math.max(...all.map((p) => p.longitude)) + 0.008,
    };
  } else if (city.simulationControl)
    bounds.current = {
      minLat: 17.32,
      maxLat: 17.51,
      minLon: 78.31,
      maxLon: 78.59,
    };
  const b = bounds.current;
  const xy = (p: Point) => ({
    x: 8 + (84 * (p.longitude - b.minLon)) / (b.maxLon - b.minLon),
    y: 8 + (84 * (b.maxLat - p.latitude)) / (b.maxLat - b.minLat),
  });
  const show = (kind: string) =>
    ["NORMAL", "TRAFFIC"].includes(layer) || layer === kind;
  const routes = city.routes.filter((r) =>
    city.incidents.some(
      (i) =>
        i.routeId === r.id && !["COMPLETED", "CANCELLED"].includes(i.status),
    ),
  );
  const focusPoint =
    focus?.kind === "ambulance"
      ? city.ambulances.find((a) => a.id === focus.id)?.location
      : focus?.kind === "hospital"
        ? city.hospitals.find((h) => h.id === focus.id)?.location
        : focus?.kind === "camera"
          ? city.cameras.find((c) => c.id === focus.id)?.location
          : city.incidents.find((i) => i.id === focus?.id)?.location;
  return (
    <div className="command-map" ref={root}>
      <div className="map-stamp">
        <span className="live-dot" /> {city.cityName || "CITY"} OPERATIONS{" "}
        <small>
          {city.simulation ? "DEMO GEOGRAPHIC NETWORK" : "REGISTERED LOCATIONS"}
        </small>
      </div>
      <div className="map-layer">
        <Layers size={15} />
        <select
          aria-label="Map mode"
          value={layer}
          onChange={(e) => setLayer(e.target.value)}
        >
          {[
            "NORMAL",
            "TRAFFIC",
            "EMERGENCIES",
            "AMBULANCES",
            "HOSPITALS",
            "CAMERAS",
            "GREEN CORRIDORS",
            "ROAD INTELLIGENCE",
          ].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && !googleFailed ? (
        <GoogleCityMap
          city={city}
          incident={incident}
          onIncident={select}
          onCamera={(id) => setFocus("camera", id)}
          onFailure={() => setGoogleFailed(true)}
        />
      ) : (
        <div className="map-network" style={{ transform: `scale(${zoom})` }}>
          <div className="map-grid" />
          <svg
            className="route-network"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="route-glow">
                <feGaussianBlur stdDeviation=".24" />
              </filter>
            </defs>
            {Array.from({ length: 9 }, (_, n) => (
              <path
                key={n}
                d={`M ${n * 12} 0 Q ${35 + n * 3} 40 ${n * 12} 100`}
                fill="none"
                stroke="#172b3a"
                strokeWidth=".5"
              />
            ))}
            {routes.map((r) => {
              const green = city.corridors.some(
                (c) => c.routeId === r.id && c.status === "ACTIVE",
              );
              return (
                <polyline
                  key={r.id}
                  className={
                    "map-route " +
                    (r.incidentId === incident?.id ? "selected" : "") +
                    (green ? " corridor" : "")
                  }
                  points={r.geometry
                    .map((p) => {
                      const q = xy(p);
                      return q.x + "," + q.y;
                    })
                    .join(" ")}
                  fill="none"
                />
              );
            })}
            {show("ROAD INTELLIGENCE") &&
              city.roadEvents
                .filter((e) => e.active)
                .map((e) => {
                  const q = xy(e);
                  return (
                    <circle
                      key={e.id}
                      cx={q.x}
                      cy={q.y}
                      r={layer === "TRAFFIC" ? 3 : 1.3}
                      fill="#ef635822"
                      stroke="#ef635866"
                      strokeWidth=".2"
                    />
                  );
                })}
          </svg>
          <div className="district-label" style={{ left: "36%", top: "28%" }}>
            KUKATPALLY
          </div>
          <div className="district-label" style={{ left: "22%", top: "42%" }}>
            HITECH CITY
          </div>
          <div className="district-label" style={{ left: "38%", top: "59%" }}>
            JUBILEE HILLS
          </div>
          <div className="district-label" style={{ left: "59%", top: "43%" }}>
            SECUNDERABAD
          </div>
          <div className="district-label" style={{ left: "75%", top: "82%" }}>
            LB NAGAR
          </div>
          {show("HOSPITALS") &&
            city.hospitals.map((h) => {
              const q = xy(h.location);
              return (
                <button
                  className="hospital-node"
                  key={h.id}
                  style={{ left: q.x + "%", top: q.y + "%" }}
                  onClick={() => setFocus("hospital", h.id)}
                  title={h.name}
                >
                  <Hospital size={17} />
                  <small>
                    {Math.max(0, h.icuBeds - h.reservations.length)} ICU
                  </small>
                </button>
              );
            })}
          {show("AMBULANCES") &&
            city.ambulances.map((a) => (
              <MovingUnit
                key={a.id}
                unit={a}
                xy={xy}
                onClick={() => {
                  setFocus("ambulance", a.id);
                  const i = city.incidents.find(
                    (i) =>
                      i.ambulanceId === a.id &&
                      !["COMPLETED", "CANCELLED"].includes(i.status),
                  );
                  if (i) select(i.id);
                  setFocus("ambulance", a.id);
                }}
              />
            ))}
          {show("EMERGENCIES") &&
            city.incidents
              .filter((i) => !["COMPLETED", "CANCELLED"].includes(i.status))
              .map((i) => {
                const q = xy(i.location);
                return (
                  <button
                    className={
                      "incident-node " +
                      i.severity.toLowerCase() +
                      (i.id === incident?.id ? " selected" : "")
                    }
                    key={i.id}
                    style={{ left: q.x + "%", top: q.y + "%" }}
                    onClick={() => select(i.id)}
                    title={i.id}
                  >
                    <span className="pulse-ring" />
                    <span>{i.severity === "CRITICAL" ? "P1" : "P2"}</span>
                  </button>
                );
              })}
          {show("CAMERAS") &&
            city.cameras.map((c) => {
              const q = xy(c.location);
              return (
                <button
                  className="camera-node"
                  key={c.id}
                  style={{ left: q.x + "%", top: q.y + "%" }}
                  title={c.name}
                  onClick={() => setFocus("camera", c.id)}
                >
                  <Camera size={13} />
                </button>
              );
            })}
          {show("ROAD INTELLIGENCE") &&
            city.roadEvents
              .filter((e) => e.active)
              .map((e) => {
                const q = xy(e);
                return (
                  <button
                    className="road-node"
                    key={e.id}
                    style={{ left: q.x + "%", top: q.y + "%" }}
                    title={e.description}
                    onClick={() => setFocus("road", e.id)}
                  >
                    <TriangleAlert size={16} />
                  </button>
                );
              })}
          {city.corridors
            .filter((c) => c.status === "ACTIVE")
            .flatMap((c) =>
              c.signals.map((s) => {
                const q = xy(s.location);
                return (
                  <span
                    className={"signal-node " + s.state.toLowerCase()}
                    key={s.id}
                    style={{ left: q.x + "%", top: q.y + "%" }}
                    title={`${s.id} ${s.state} ${s.priority}`}
                  />
                );
              }),
            )}
          {focusPoint && (
            <span
              className="selected-spotlight"
              style={{
                left: xy(focusPoint).x + "%",
                top: xy(focusPoint).y + "%",
              }}
            />
          )}
        </div>
      )}
      <div className="map-controls-command">
        <button
          title="Zoom in"
          onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
        >
          +
        </button>
        <button
          title="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
        >
          −
        </button>
        <button
          title="Recenter"
          onClick={() => {
            setZoom(1);
            setFocus("incident", incident?.id || "");
          }}
        >
          <LocateFixed size={17} />
        </button>
        <button
          title="Fullscreen map"
          onClick={() => {
            if (!document.fullscreenElement)
              void root.current?.requestFullscreen();
            else void document.exitFullscreen();
          }}
        >
          <Maximize size={17} />
        </button>
      </div>
      <div className="map-legend">
        <span className="legend-green" /> Available{" "}
        <span className="legend-cyan" /> Assigned{" "}
        <span className="legend-red" /> Critical{" "}
        <span className="legend-amber" /> Disruption
      </div>
    </div>
  );
}
