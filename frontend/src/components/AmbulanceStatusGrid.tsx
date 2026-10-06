import React from 'react';
import { Clock, Truck } from 'lucide-react';
import { Ambulance } from '../types';

interface AmbulanceStatusGridProps {
  ambulances: Ambulance[];
}

const capabilityNames: Record<Ambulance['capabilityTier'], string> = {
  ALS: 'Advanced care',
  BLS: 'Basic care',
  PATIENT_TRANSPORT: 'Patient transport'
};

function statusName(ambulance: Ambulance): string {
  if (ambulance.isAvailable) return 'Available';
  const labels: Record<string, string> = {
    ON_MISSION: 'On a response',
    ASSIGNED: 'Crew assigned',
    OUT_OF_SERVICE: 'Out of service',
    UNAVAILABLE: 'Unavailable'
  };
  return labels[ambulance.status] || ambulance.status.replace(/_/g, ' ').toLowerCase();
}

export const AmbulanceStatusGrid: React.FC<AmbulanceStatusGridProps> = ({ ambulances }) => (
  <section className="glass-panel space-y-4 p-4">
    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-teal-700" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-900">Ambulance availability</h2>
      </div>
      <span className="text-xs text-slate-500">{ambulances.length} total</span>
    </div>

    <div className="space-y-2">
      {ambulances.map(ambulance => (
        <article key={ambulance.ambulanceId} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900">{ambulance.ambulanceId}</span>
            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${ambulance.isAvailable ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              {statusName(ambulance)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">Vehicle {ambulance.licensePlate} · {capabilityNames[ambulance.capabilityTier]}</p>
          <p className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Location updated {Number.isNaN(Date.parse(ambulance.telemetryUpdatedAt))
              ? 'at an unknown time'
              : new Date(ambulance.telemetryUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </article>
      ))}
      {ambulances.length === 0 && <p className="text-sm text-slate-500">No ambulance updates are available right now.</p>}
    </div>
  </section>
);
