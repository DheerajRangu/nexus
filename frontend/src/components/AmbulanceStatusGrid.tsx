import React from 'react';
import { Truck, Wifi, ShieldCheck, Clock } from 'lucide-react';
import { Ambulance } from '../types';

interface AmbulanceStatusGridProps {
  ambulances: Ambulance[];
}

export const AmbulanceStatusGrid: React.FC<AmbulanceStatusGridProps> = ({ ambulances }) => {
  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4 border border-slate-800">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-teal-400" />
          <h3 className="font-extrabold text-sm text-white">AMBULANCE FLEET TELEMETRY FRESHNESS</h3>
        </div>
        <span className="font-mono text-xs text-slate-400">
          Total Vehicles: <strong className="text-white">{ambulances.length}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ambulances.map((amb) => (
          <div key={amb.ambulanceId} className="p-3 rounded-xl bg-navy-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-white">{amb.ambulanceId}</span>
              <span
                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                  amb.isAvailable
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {amb.status}
              </span>
            </div>

            <p className="text-xs text-slate-300 font-mono">Plate: {amb.licensePlate} ({amb.capabilityTier})</p>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <Wifi className="w-3 h-3" /> Signal Fresh
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" /> 4 sec ago
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
