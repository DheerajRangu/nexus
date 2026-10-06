import { motion } from "framer-motion";
import { MapPin, Navigation, Radio } from "lucide-react";
import { GoogleCityMap } from "../GoogleCityMap";
import type { City, Hospital, Incident, Point } from "../services/ecosystem";
export function HospitalMap({
  city,
  hospital,
  incident,
}: {
  city: City;
  hospital: Hospital;
  incident?: Incident;
}) {
  const route = city.routes.find((r) => r.id === incident?.routeId),
    ambulance = city.ambulances.find((a) => a.id === incident?.ambulanceId),
    corridor = city.corridors.find((c) => c.id === incident?.corridorId);
  const points = [
    hospital.location,
    ...(route?.geometry || []),
    ...(ambulance ? [ambulance.location] : []),
  ];
  const minLat = Math.min(...points.map((p) => p.latitude)) - 0.004,
    maxLat = Math.max(...points.map((p) => p.latitude)) + 0.004,
    minLon = Math.min(...points.map((p) => p.longitude)) - 0.004,
    maxLon = Math.max(...points.map((p) => p.longitude)) + 0.004;
  const xy = (p: Point) => ({
    x: ((p.longitude - minLon) / (maxLon - minLon)) * 100,
    y: 100 - ((p.latitude - minLat) / (maxLat - minLat)) * 100,
  });
  const h = xy(hospital.location),
    a = ambulance ? xy(ambulance.location) : null;
  const visibleRoads = city.roadEvents.filter(
    (r) =>
      r.active &&
      r.latitude >= minLat &&
      r.latitude <= maxLat &&
      r.longitude >= minLon &&
      r.longitude <= maxLon,
  );
  const mapCity = {
    ...city,
    hospitals: [hospital],
    ambulances: ambulance ? [ambulance] : [],
    incidents: incident ? [incident] : [],
    routes: route ? [route] : [],
    corridors: corridor ? [corridor] : [],
  };
  return (
    <div className="hc-map">
      <div className="hc-map-grid" />
      <GoogleCityMap
        city={mapCity}
        incident={incident}
        onIncident={() => {}}
        onCamera={() => {}}
        onFailure={() => {}}
      />
      <div className="hc-map-caption">
        <Radio size={12} />
        {city.simulation ? "DEMO GEOGRAPHIC FEED" : "SHARED AMBULANCE LOCATION"}
        <span>{route?.provider || "Awaiting route"}</span>
      </div>
      <svg
        className="hc-route"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="hospitalRouteGlow">
            <feGaussianBlur stdDeviation=".3" />
          </filter>
        </defs>
        {route && (
          <>
            <polyline
              points={route.geometry
                .map((p) => {
                  const q = xy(p);
                  return `${q.x},${q.y}`;
                })
                .join(" ")}
              fill="none"
              stroke={corridor?.status === "ACTIVE" ? "#3ee6a2" : "#32d8f2"}
              strokeWidth="1.4"
              opacity=".22"
            />
            <polyline
              className="hc-route-line"
              points={route.geometry
                .map((p) => {
                  const q = xy(p);
                  return `${q.x},${q.y}`;
                })
                .join(" ")}
              fill="none"
              stroke={corridor?.status === "ACTIVE" ? "#3ee6a2" : "#32d8f2"}
              strokeWidth=".5"
            />
          </>
        )}
        {visibleRoads.map((r) => {
          const p = xy(r);
          return (
            <g key={r.id}>
              <circle cx={p.x} cy={p.y} r="2.6" fill="#f35b68" opacity=".18" />
              <circle cx={p.x} cy={p.y} r=".65" fill="#f35b68" />
            </g>
          );
        })}
        {corridor?.status === "ACTIVE" &&
          corridor.signals.map((s) => {
            const p = xy(s.location);
            return (
              <circle
                key={s.id}
                cx={p.x}
                cy={p.y}
                r=".65"
                fill={
                  s.state === "GREEN"
                    ? "#3ee6a2"
                    : s.state === "AMBER"
                      ? "#f3be5b"
                      : "#f35b68"
                }
              />
            );
          })}
      </svg>
      <div
        className="hc-map-hospital"
        style={{ left: h.x + "%", top: h.y + "%" }}
      >
        <span>✚</span>
        <b>RECEIVING CENTER</b>
        <small>{hospital.name}</small>
      </div>
      {a && (
        <motion.div
          className="hc-map-ambulance"
          animate={{ left: a.x + "%", top: a.y + "%" }}
          transition={{ duration: 0.9, ease: "linear" }}
        >
          <Navigation
            size={18}
            style={{ transform: `rotate(${ambulance?.heading || 0}deg)` }}
          />
          <b>{ambulance?.id}</b>
        </motion.div>
      )}
      <div className="hc-map-scale">
        <MapPin size={12} /> {visibleRoads.length} route disruptions ·{" "}
        {corridor?.status === "ACTIVE" ? "CORRIDOR ACTIVE" : "STANDARD ROUTE"}
      </div>
    </div>
  );
}
