import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Ambulance, Hospital, EmergencyCase, IncidentLocation, MissionRoute, Roadblock, GreenCorridorSignal } from '../types';

interface LiveMapProps {
  ambulances: Ambulance[];
  hospitals: Hospital[];
  cases: EmergencyCase[];
  locations: IncidentLocation[];
  routes: MissionRoute[];
  roadblocks: Roadblock[];
  signals: GreenCorridorSignal[];
  selectedCaseId?: string;
  onSelectCase?: (caseId: string) => void;
}

// Custom Leaflet DivIcon Generators
const createAmbulanceIcon = (tier: string, isAvailable: boolean) => L.divIcon({
  className: 'custom-map-icon',
  html: `
    <div class="relative flex items-center justify-center w-8 h-8 rounded-full ${isAvailable ? 'bg-teal-500 border-2 border-white shadow-lg shadow-teal-500/50' : 'bg-amber-500 border-2 border-white shadow-lg animate-pulse'}">
      <span class="text-white text-[10px] font-extrabold font-mono">${tier}</span>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const createHospitalIcon = (icuCount: number) => L.divIcon({
  className: 'custom-map-icon',
  html: `
    <div class="relative flex items-center justify-center w-9 h-9 rounded-xl bg-navy-900 border-2 border-emerald-400 shadow-xl shadow-emerald-500/30">
      <span class="text-emerald-400 font-bold text-xs">H</span>
      <span class="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-950 font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">${icuCount}</span>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const createIncidentIcon = (priority: string) => L.divIcon({
  className: 'custom-map-icon',
  html: `
    <div class="relative flex items-center justify-center w-8 h-8 rounded-full ${priority === 'P1_CRITICAL' ? 'bg-red-500 border-2 border-white animate-bounce shadow-lg shadow-red-500/60' : 'bg-orange-500 border-2 border-white shadow-md'}">
      <span class="text-white font-black text-xs">!</span>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const createRoadblockIcon = () => L.divIcon({
  className: 'custom-map-icon',
  html: `
    <div class="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs border border-amber-300 shadow-md">
      🚧
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

const createSignalIcon = (state: string) => {
  const colorMap: Record<string, string> = {
    ACTIVE: 'bg-emerald-500 text-slate-950 animate-pulse',
    CLEARING: 'bg-amber-400 text-slate-950',
    REQUESTED: 'bg-teal-400 text-slate-950',
    UNAVAILABLE: 'bg-slate-700 text-slate-400'
  };
  return L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="w-6 h-6 rounded-full border border-white flex items-center justify-center ${colorMap[state] || 'bg-slate-700'} shadow-md">
        <span class="text-[9px] font-mono font-bold">🚥</span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

function MapViewRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  ambulances,
  hospitals,
  cases,
  locations,
  routes,
  roadblocks,
  signals,
  selectedCaseId,
  onSelectCase
}) => {
  const positioned = ambulances.find(a => Number.isFinite(a.latitude) && Number.isFinite(a.longitude));
  const defaultCenter: [number, number] = positioned ? [positioned.latitude, positioned.longitude] : [12.9716, 77.5946];

  return (
    <div className="relative w-full h-[520px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        className="w-full h-full"
        zoomControl={false}
      >
        <MapViewRecenter center={defaultCenter} />

        {/* Standard light map tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Ambulances */}
        {ambulances.map((amb) => (
          <Marker
            key={amb.ambulanceId}
            position={[amb.latitude, amb.longitude]}
            icon={createAmbulanceIcon(amb.capabilityTier, amb.isAvailable)}
          >
            <Popup>
              <div className="p-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-sm text-teal-400">{amb.ambulanceId}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${amb.isAvailable ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {amb.status}
                  </span>
                </div>
                <p className="text-xs text-slate-300">Plate: {amb.licensePlate} ({amb.capabilityTier})</p>
                <div className="text-[11px] text-slate-400 flex gap-2">
                  <span>Ventilator: {amb.hasVentilator ? 'YES' : 'NO'}</span>
                  <span>Defib: {amb.hasDefibrillator ? 'YES' : 'NO'}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Hospitals */}
        {hospitals.map((hosp) => (
          <Marker
            key={hosp.hospitalId}
            position={[hosp.latitude, hosp.longitude]}
            icon={createHospitalIcon(hosp.availableIcu)}
          >
            <Popup>
              <div className="p-1 space-y-1">
                <h4 className="font-bold text-sm text-emerald-400">{hosp.name}</h4>
                <div className="flex gap-3 text-xs text-slate-300 font-mono">
                  <span>Gen Beds: <strong className="text-white">{hosp.availableBeds}</strong></span>
                  <span>ICU Beds: <strong className="text-emerald-400">{hosp.availableIcu}</strong></span>
                </div>
                <p className="text-[11px] text-slate-400">ER Workload: <span className="text-amber-400 font-semibold">{hosp.emergencyWorkload}</span></p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Emergency Cases */}
        {cases.map((c) => {
          const location = locations.find(item => item.emergencyId === c.emergencyId);
          const lat = location?.confirmedLat ?? location?.callerLat;
          const lng = location?.confirmedLng ?? location?.callerLng;
          if (lat == null || lng == null) return null;
          return (
            <React.Fragment key={c.emergencyId}>
              <Marker
                position={[lat, lng]}
                icon={createIncidentIcon(c.triagePriority)}
                eventHandlers={{
                  click: () => onSelectCase && onSelectCase(c.emergencyId)
                }}
              >
                <Popup>
                  <div className="p-1 space-y-1">
                    <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
                      {c.triagePriority}
                    </span>
                    <h4 className="font-extrabold text-xs text-white mt-1">{c.emergencyId}</h4>
                    <p className="text-xs text-slate-300 italic">{c.chiefComplaint}</p>
                    <p className="text-[11px] text-slate-400">{c.rawOperatorNotes}</p>
                  </div>
                </Popup>
              </Marker>
              {/* Incident location accuracy circle */}
              <Circle
                center={[lat, lng]}
                radius={c.locationConfirmed ? 30 : 150}
                pathOptions={{
                  color: c.locationConfirmed ? '#10b981' : '#f59e0b',
                  fillColor: c.locationConfirmed ? '#10b981' : '#f59e0b',
                  fillOpacity: 0.15,
                  dashArray: c.locationConfirmed ? undefined : '4, 8'
                }}
              />
            </React.Fragment>
          );
        })}

        {/* Refreshed route previews for active missions. Demo lines are dashed and labelled. */}
        {routes.filter(route => route.routeAvailable && route.points && route.points.length > 1).map(route => (
          <Polyline
            key={`${route.missionId}-${route.routeVersion ?? 'current'}`}
            positions={route.points!.map(point => [point.latitude, point.longitude] as [number, number])}
            pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.85, dashArray: route.simulated ? '8 8' : undefined }}
          >
            <Popup>
              <div className="space-y-1 text-xs text-slate-700">
                <strong>{route.leg === 'TO_PATIENT' ? 'To patient' : 'To hospital'}</strong>
                <p>{route.destinationLabel}</p>
                <p>Estimated travel: {route.estimatedDurationMins?.toFixed(1) ?? '—'} min</p>
                <p>{route.simulated ? 'Simulated route preview' : 'Traffic-aware route'}</p>
                {route.locationUpdatedAt && <p>Ambulance location updated {new Date(route.locationUpdatedAt).toLocaleTimeString()}</p>}
              </div>
            </Popup>
          </Polyline>
        ))}

        {/* Roadblocks */}
        {roadblocks.map((rb) => (
          <React.Fragment key={rb.roadblockId}>
            <Marker position={[rb.latitude, rb.longitude]} icon={createRoadblockIcon()}>
              <Popup>
                <div className="p-1 space-y-1">
                  <span className="text-amber-400 font-bold text-xs">🚧 ROADBLOCK</span>
                  <p className="text-xs text-slate-300">{rb.source}</p>
                  <p className="text-[11px] text-slate-400">Radius: {rb.radiusMeters}m ({rb.scope})</p>
                </div>
              </Popup>
            </Marker>
            <Circle
              center={[rb.latitude, rb.longitude]}
              radius={rb.radiusMeters}
              pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.3 }}
            />
          </React.Fragment>
        ))}

        {/* Green Corridor Signals */}
        {signals.map((sig) => (
          <Marker
            key={sig.junctionId}
            position={[sig.latitude, sig.longitude]}
            icon={createSignalIcon(sig.currentState)}
          >
            <Popup>
              <div className="p-1 space-y-1">
                <span className="text-teal-400 font-bold text-xs">🚥 GREEN CORRIDOR JUNCTION</span>
                <p className="text-xs text-slate-200">{sig.name}</p>
                <p className="text-[11px] font-mono text-emerald-400 font-bold">State: {sig.currentState}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Map Overlay Legend */}
      {routes.length > 0 && <div className="absolute right-3 top-3 z-[200] max-w-xs rounded-lg border border-teal-100 bg-white/95 p-3 text-xs shadow-md">
        {routes.map(route => <p key={route.missionId} className="mb-1 last:mb-0 text-slate-700">
          <strong className="text-teal-800">{route.leg === 'TO_PATIENT' ? 'To patient' : 'To hospital'}:</strong>{' '}
          {route.routeAvailable ? `about ${route.estimatedDurationMins?.toFixed(1)} min` : route.operatorAlert ?? 'Waiting for location'}
          {route.simulated && route.routeAvailable && <span className="ml-1 text-amber-700">· simulated</span>}
        </p>)}
        <p className="mt-1 border-t border-slate-100 pt-1 text-[10px] text-slate-500">Route estimates refresh with ambulance location updates.</p>
      </div>}
      <div className="absolute bottom-4 left-4 z-[200] glass-panel px-3 py-2 rounded-xl border border-slate-700/60 flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400"></span>
          <span className="text-slate-300">ALS Ambulance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span className="text-slate-300">Hospital ER</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
          <span className="text-slate-300">P1 Incident</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
          <span className="text-slate-300">Road closure</span>
        </div>
      </div>
    </div>
  );
};
