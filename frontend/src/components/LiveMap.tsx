import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Ambulance, Hospital, EmergencyCase, Roadblock, GreenCorridorSignal } from '../types';

interface LiveMapProps {
  ambulances: Ambulance[];
  hospitals: Hospital[];
  cases: EmergencyCase[];
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
  roadblocks,
  signals,
  selectedCaseId,
  onSelectCase
}) => {
  const defaultCenter: [number, number] = [12.9716, 77.5946]; // Bangalore City Center

  return (
    <div className="relative w-full h-[520px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
      <MapContainer
        center={defaultCenter}
        zoom={13}
        className="w-full h-full"
        zoomControl={false}
      >
        <MapViewRecenter center={defaultCenter} />

        {/* Dark Mode Map Tiles */}
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
          // MG Road default lat/lng
          const lat = 12.9716;
          const lng = 77.5946;
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
          <span className="text-slate-300">Roadblock Hazard</span>
        </div>
      </div>
    </div>
  );
};
