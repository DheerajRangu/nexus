import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { GeoPoint, Telemetry } from "../../shared/contract";
import type { Lang } from "../../shared/contract";
import { translate } from "../i18n";
import { boundsAround, project, unproject, type Bounds } from "./geo";
import { interpolateObservation, type DisplayPosition } from "./interpolate";

interface MapPoint extends GeoPoint {
  draggable?: boolean;
}

interface GoogleMapHandle {
  setCenter: (position: object) => void;
  fitBounds: (bounds: object, padding?: number) => void;
}

interface GoogleOverlay {
  setMap: (map: GoogleMapHandle | null) => void;
}

interface GoogleMarker extends GoogleOverlay {
  setPosition: (point: {lat:number;lng:number}) => void;
  addListener: (name: string, handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void;
}

interface GoogleNamespace {
  maps: {
    Map: new (element: HTMLElement, options: object) => GoogleMapHandle;
    Marker: new (options: object) => GoogleMarker;
    Polyline: new (options: object) => GoogleOverlay;
    Circle: new (options: object) => GoogleOverlay;
    LatLngBounds: new () => { extend: (position: object) => void };
  };
}

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

const loaders = new Map<string, Promise<GoogleNamespace>>();

export function loadGoogle(apiKey: string): Promise<GoogleNamespace> {
  const existing = loaders.get(apiKey);
  if (existing) return existing;
  const pending = new Promise<GoogleNamespace>((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.referrerPolicy = "origin";
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("maps")));
    script.onerror = () => reject(new Error("maps"));
    document.head.appendChild(script);
  });
  loaders.set(apiKey, pending);
  return pending;
}

export function TrackingMap(props: {
  showProviderHint?: boolean;
  lang: Lang;
  pickup: MapPoint | null;
  device: GeoPoint | null;
  telemetry: Telemetry | null;
  synthetic: boolean;
  hospital: GeoPoint | null;
  route: GeoPoint[] | null;
  accuracyMeters: number | null;
  onPickupChange?: (point: GeoPoint) => void;
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [googleReady, setGoogleReady] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadGoogle(apiKey)
      .then(() => {
        if (!cancelled) setGoogleReady(true);
      })
      .catch(() => {
        if (!cancelled) setGoogleFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  if (apiKey && googleReady && !googleFailed) {
    return <GoogleTrackingMap {...props} />;
  }
  return <FallbackMap {...props} showKeyHint={props.showProviderHint !== false && (!apiKey || googleFailed)} />;
}

function useAmbulanceMarker(telemetry: Telemetry | null): DisplayPosition | null {
  const previous = useRef<Telemetry | null>(null);
  const [display, setDisplay] = useState<DisplayPosition | null>(() =>
    telemetry ? interpolateObservation(null, telemetry, Date.now(), 0, false) : null,
  );
  const signature = telemetry
    ? `${telemetry.ambulanceId}|${telemetry.observedAt}|${telemetry.latitude}|${telemetry.longitude}|${telemetry.stale}`
    : "";

  useEffect(() => {
    if (!telemetry) {
      previous.current = null;
      setDisplay(null);
      return;
    }
    const prior = previous.current;
    previous.current = telemetry;
    const allowAnimation =
      typeof window.matchMedia !== "function" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const started = performance.now();
    const tick = (time: number) => {
      const sample = interpolateObservation(prior, telemetry, Date.now(), time - started, allowAnimation);
      setDisplay(sample);
      if (sample.animating) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [signature, telemetry]);

  useEffect(() => {
    if (!telemetry || telemetry.stale) return;
    const due = Date.parse(telemetry.observedAt) + telemetry.staleAfterSeconds * 1000 - Date.now();
    if (due <= 0) return;
    const timer = window.setTimeout(() => {
      setDisplay({
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        animating: false,
        stale: true,
      });
    }, due + 30);
    return () => window.clearTimeout(timer);
  }, [telemetry]);

  return display;
}

function GoogleTrackingMap(props: {
  lang: Lang;
  pickup: MapPoint | null;
  device: GeoPoint | null;
  telemetry: Telemetry | null;
  synthetic: boolean;
  hospital: GeoPoint | null;
  route: GeoPoint[] | null;
  accuracyMeters: number | null;
  onPickupChange?: (point: GeoPoint) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapHandle | null>(null);
  const overlays = useRef<GoogleOverlay[]>([]);
  const display = useAmbulanceMarker(props.telemetry);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !element.current || mapRef.current) return;
    mapRef.current = new maps.Map(element.current, {
      center: { lat: 17.385044, lng: 78.486671 },
      zoom: 13,
      clickableIcons: false,
      gestureHandling: "greedy",
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
    });
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map) return;
    for (const overlay of overlays.current) overlay.setMap(null);
    overlays.current = [];
    const bounds = new maps.LatLngBounds();
    let count = 0;
    const add = (point: GeoPoint) => {
      bounds.extend({ lat: point.latitude, lng: point.longitude });
      count += 1;
    };
    if (props.route) {
      overlays.current.push(
        new maps.Polyline({
          map,
          path: props.route.map((point) => ({ lat: point.latitude, lng: point.longitude })),
          strokeColor: "#0F766E",
          strokeOpacity: 0.85,
          strokeWeight: 4,
        }),
      );
      props.route.forEach(add);
    }
    if (props.pickup) {
      add(props.pickup);
      if (props.accuracyMeters && props.accuracyMeters > 0) {
        overlays.current.push(
          new maps.Circle({
            map,
            center: { lat: props.pickup.latitude, lng: props.pickup.longitude },
            radius: props.accuracyMeters,
            strokeColor: "#0F766E",
            strokeOpacity: 0.6,
            fillColor: "#0F766E",
            fillOpacity: 0.12,
          }),
        );
      }
      const marker = new maps.Marker({
        map,
        position: { lat: props.pickup.latitude, lng: props.pickup.longitude },
        draggable: Boolean(props.onPickupChange && props.pickup.draggable !== false),
        title: translate(props.lang, "pickupPin"),
      });
      marker.addListener("dragend", (event) => {
        const latLng = event.latLng;
        if (!latLng || !props.onPickupChange) return;
        props.onPickupChange({ latitude: latLng.lat(), longitude: latLng.lng() });
      });
      overlays.current.push(marker);
    }
    if (props.device) {
      add(props.device);
      overlays.current.push(
        new maps.Marker({
          map,
          position: { lat: props.device.latitude, lng: props.device.longitude },
          title: translate(props.lang, "deviceDot"),
          icon: { path: 0, scale: 7, fillColor: "#334E68", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
        }),
      );
    }
    if (display && !display.stale) {
      add(display);
      overlays.current.push(
        new maps.Marker({
          map,
          position: { lat: display.latitude, lng: display.longitude },
          title: translate(props.lang, props.synthetic ? "demoPosition" : "livePosition"),
          icon: { path: 0, scale: 9, fillColor: "#0F766E", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
        }),
      );
    } else if (display?.stale) {
      add(display);
      overlays.current.push(
        new maps.Marker({
          map,
          position: { lat: display.latitude, lng: display.longitude },
          title: translate(props.lang, "lastKnown", { time: "" }),
          icon: { path: 0, scale: 9, fillColor: "#92400E", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
        }),
      );
    }
    if (props.hospital) {
      add(props.hospital);
      overlays.current.push(
        new maps.Marker({
          map,
          position: { lat: props.hospital.latitude, lng: props.hospital.longitude },
          title: translate(props.lang, "hospital"),
        }),
      );
    }
    if (count > 1) map.fitBounds(bounds, 48);
    else if (count === 1 && props.pickup) map.setCenter({ lat: props.pickup.latitude, lng: props.pickup.longitude });
  }, [display, props]);

  return (
    <div className="relative h-72 overflow-hidden rounded-2xl border border-line bg-mist">
      <div ref={element} className="h-full w-full" />
      {display?.stale ? (
        <p className="absolute left-3 top-3 rounded-full bg-alertbg px-3 py-1 text-sm font-semibold text-alert">
          {translate(props.lang, "staleNote")}
        </p>
      ) : null}
    </div>
  );
}

function FallbackMap(props: {
  lang: Lang;
  pickup: MapPoint | null;
  device: GeoPoint | null;
  telemetry: Telemetry | null;
  synthetic: boolean;
  hospital: GeoPoint | null;
  route: GeoPoint[] | null;
  accuracyMeters: number | null;
  onPickupChange?: (point: GeoPoint) => void;
  showKeyHint: boolean;
}) {
  const display = useAmbulanceMarker(props.telemetry);
  const width = 360;
  const height = 280;
  const points: GeoPoint[] = [];
  if (props.pickup) points.push(props.pickup);
  if (props.device) points.push(props.device);
  if (display) points.push(display);
  if (props.hospital) points.push(props.hospital);
  props.route?.forEach((point) => points.push(point));
  const bounds: Bounds = boundsAround(points);
  const route = (props.route ?? []).map((point) => project(point, bounds, width, height));
  const pickup = props.pickup ? project(props.pickup, bounds, width, height) : null;
  const device = props.device ? project(props.device, bounds, width, height) : null;
  const ambulance = display ? project(display, bounds, width, height) : null;
  const hospital = props.hospital ? project(props.hospital, bounds, width, height) : null;

  function movePin(event: PointerEvent<SVGSVGElement>) {
    if (!props.onPickupChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = ((event.clientY - rect.top) / rect.height) * height;
    props.onPickupChange(unproject(x, y, bounds, width, height));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-[#d7ebe7]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={translate(props.lang, props.synthetic ? "demoPosition" : "livePosition")}
        className="h-72 w-full touch-none"
        onPointerDown={props.onPickupChange ? movePin : undefined}
      >
        {route.length > 1 ? (
          <polyline
            fill="none"
            stroke="#0F766E"
            strokeWidth="4"
            points={route.map((point) => `${point.x},${point.y}`).join(" ")}
          />
        ) : null}
        {device ? <circle cx={device.x} cy={device.y} r="6" fill="#334E68" /> : null}
        {hospital ? <rect x={hospital.x - 7} y={hospital.y - 7} width="14" height="14" rx="2" fill="#065F46" /> : null}
        {ambulance ? (
          <circle
            data-testid="ambulance-marker"
            data-stale={display?.stale ? "true" : "false"}
            cx={ambulance.x}
            cy={ambulance.y}
            r="9"
            fill={display?.stale ? "#92400E" : "#0F766E"}
            stroke="white"
            strokeWidth="2"
          />
        ) : null}
        {pickup ? (
          <g data-testid="pickup-pin" transform={`translate(${pickup.x} ${pickup.y})`}>
            <path d="M0 -16 a8 8 0 0 1 0 16 a8 8 0 0 1 0 -16" fill="#102A43" />
            <circle cy="-16" r="3" fill="white" />
          </g>
        ) : null}
      </svg>
      <div className="space-y-1 px-3 py-2 text-sm text-muted">
        {props.showKeyHint ? <p>{translate(props.lang, "mapFallback")}</p> : null}
        {display?.stale ? (
          <p data-testid="stale-chip" className="font-semibold text-alert">
            {translate(props.lang, "staleNote")}
          </p>
        ) : null}
        {!props.pickup ? <p>{translate(props.lang, "defaultMap")}</p> : null}
      </div>
    </div>
  );
}
