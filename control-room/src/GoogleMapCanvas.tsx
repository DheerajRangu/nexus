import { useEffect, useRef } from 'react';
import type { EmergencySnapshot } from './domain';
import './google-map.css';

declare global { interface Window { google?: any; } }
let mapsPromise: Promise<any> | undefined;
function mapsApi(key: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!mapsPromise) mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.async = true; script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps did not initialize.'));
    script.onerror = () => reject(new Error('Google Maps could not be loaded.'));
    document.head.append(script);
  });
  return mapsPromise;
}

/** Optional adapter. No key means the caller renders its explicit simulation adapter instead. */
export function GoogleMapCanvas({ snapshot, selected }: { snapshot: EmergencySnapshot; selected: string }) {
  const element = useRef<HTMLDivElement>(null); const state = useRef<{ map?: any; markers: any[]; line?: any }>({ markers: [] });
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string;
  useEffect(() => { let cancelled = false; void mapsApi(key).then((maps) => { if (cancelled || !element.current) return; const pickup = snapshot.pickup.coordinates!; const current = state.current; if (!current.map) current.map = new maps.Map(element.current, { center: pickup, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy', styles: [{ featureType: 'poi.business', stylers: [{ visibility: 'off' }] }] }); current.markers.forEach((marker) => marker.setMap(null)); current.markers = [new maps.Marker({ map: current.map, position: pickup, title: 'Confirmed patient pickup', label: { text: 'P', color: '#17232a', fontWeight: '700' }, icon: { path: maps.SymbolPath.CIRCLE, fillColor: '#f0b35b', fillOpacity: 1, strokeColor: '#fff0d4', strokeWeight: 2, scale: 11 } })]; snapshot.candidates.forEach((candidate) => { const telemetry = candidate.ambulance.telemetry; if (!telemetry) return; current.markers.push(new maps.Marker({ map: current.map, position: telemetry.coordinates, title: `${candidate.ambulance.callSign} · ${candidate.ambulance.status}`, label: { text: candidate.ambulance.callSign.replace('AMB-', ''), color: '#eaffff', fontSize: '10px', fontWeight: '700' }, icon: { path: maps.SymbolPath.CIRCLE, fillColor: candidate.ambulance.ambulanceId === selected ? '#16a896' : telemetry.freshness === 'STALE' ? '#7e6657' : '#0b6970', fillOpacity: 1, strokeColor: '#d5fffa', strokeWeight: candidate.ambulance.ambulanceId === selected ? 3 : 1, scale: 12 } })); }); if (current.line) current.line.setMap(null); const route = snapshot.assignment?.route; if (route?.geometry?.length) current.line = new maps.Polyline({ map: current.map, path: route.geometry, strokeColor: '#2bcdb7', strokeWeight: 5, strokeOpacity: .85 }); }).catch(() => {/* backend provider health remains authoritative */}); return () => { cancelled = true; }; }, [key, selected, snapshot]);
  return <div className="operations-map google-map" role="img" aria-label="Google map showing confirmed patient pickup and nearby ambulance locations"><div ref={element} className="google-map-element"/><div className="simulation-watermark">SIMULATION · GOOGLE MAPS ADAPTER</div></div>;
}
