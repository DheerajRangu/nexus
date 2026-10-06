import { useEffect, useRef, useState } from "react";
import { loadGoogle } from "../../src/map/TrackingMap";
import type { City, Incident, Point } from "./services/ecosystem";
type Maps = NonNullable<Window["google"]>["maps"];
type Marker = InstanceType<Maps["Marker"]>;
export function GoogleCityMap({
  city,
  incident,
  onIncident,
  onCamera,
  onFailure,
}: {
  city: City;
  incident?: Incident;
  onIncident: (id: string) => void;
  onCamera: (id: string) => void;
  onFailure: () => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<InstanceType<Maps["Map"]> | null>(null),
    markers = useRef(new Map<string, Marker>()),
    line = useRef<InstanceType<Maps["Polyline"]> | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      onFailure();
      return;
    }
    let active = true;
    void loadGoogle(apiKey)
      .then((m) => {
        if (!active || !element.current) return;
        map.current = new m.maps.Map(element.current, {
          center: {
            lat: city.ambulances[0]?.location.latitude || 17.448,
            lng: city.ambulances[0]?.location.longitude || 78.391,
          },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
        });
        setReady(true);
      })
      .catch(() => {
        if (active) onFailure();
      });
    return () => {
      active = false;
      markers.current.forEach((m) => m.setMap(null));
      line.current?.setMap(null);
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !window.google) return;
    const maps = window.google.maps;
    const point = (p: Point) => ({ lat: p.latitude, lng: p.longitude });
    const items = [
      ...city.ambulances.map((a) => ({
        id: a.id,
        point: a.location,
        label: "A",
        title: a.id + " " + a.status,
        click: () =>
          onIncident(
            city.incidents.find((e) => e.ambulanceId === a.id)?.id || "",
          ),
      })),
      ...city.hospitals.map((h) => ({
        id: h.id,
        point: h.location,
        label: "H",
        title: h.name,
        click: () => {},
      })),
      ...city.incidents.map((e) => ({
        id: e.id,
        point: e.location,
        label: "P",
        title: e.id,
        click: () => onIncident(e.id),
      })),
      ...city.cameras.map((c) => ({
        id: c.id,
        point: c.location,
        label: "C",
        title: c.name,
        click: () => onCamera(c.id),
      })),
      ...city.roadEvents
        .filter((e) => e.active)
        .map((e) => ({
          id: e.id,
          point: e,
          label: "!",
          title: e.type,
          click: () => {},
        })),
    ];
    const ids = new Set(items.map((i) => i.id));
    for (const [id, marker] of markers.current)
      if (!ids.has(id)) {
        marker.setMap(null);
        markers.current.delete(id);
      }
    for (const item of items) {
      let marker = markers.current.get(item.id);
      if (marker) marker.setPosition(point(item.point));
      else {
        marker = new maps.Marker({
          map: map.current,
          position: point(item.point),
          label: item.label,
          title: item.title,
        });
        marker.addListener("click", item.click);
        markers.current.set(item.id, marker);
      }
    }
  }, [city.revision, ready]);
  useEffect(() => {
    if (!ready || !map.current || !window.google) return;
    line.current?.setMap(null);
    const route = city.routes.find((r) => r.id === incident?.routeId);
    if (route)
      line.current = new window.google.maps.Polyline({
        map: map.current,
        path: route.geometry.map((p) => ({
          lat: p.latitude,
          lng: p.longitude,
        })),
        strokeColor: "#19ae7d",
        strokeWeight: 5,
      });
  }, [incident?.routeId, ready]);
  return (
    <div
      ref={element}
      style={{
        height: city.simulationControl ? "100%" : 440,
        minHeight: 340,
        width: "100%",
      }}
      aria-label="Google operations map"
    />
  );
}
