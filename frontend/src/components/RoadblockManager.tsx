import React, { useState } from 'react';
import { AlertOctagon, Plus, MapPin, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Roadblock } from '../types';

interface RoadblockManagerProps {
  roadblocks: Roadblock[];
  onCreateRoadblock: (payload: any) => void;
}

export const RoadblockManager: React.FC<RoadblockManagerProps> = ({ roadblocks, onCreateRoadblock }) => {
  const [source, setSource] = useState('Metro Construction Edge Block');
  const [latitude, setLatitude] = useState(12.9750);
  const [longitude, setLongitude] = useState(77.5980);
  const [radiusMeters, setRadiusMeters] = useState(150);
  const [scope, setScope] = useState('FULL_BLOCK');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoadblock({ source, latitude, longitude, radiusMeters, scope });
  };

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4 border border-slate-800">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-amber-400" />
          <h3 className="font-extrabold text-sm text-white">ACTIVE ROADBLOCK HAZARDS & ROUTE RESTRICTIONS</h3>
        </div>
        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/30">
          {roadblocks.length} Active Hazards
        </span>
      </div>

      {/* Roadblocks List */}
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {roadblocks.map((rb) => (
          <div key={rb.roadblockId} className="p-3 rounded-xl bg-navy-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-amber-300">{rb.source}</span>
                <span className="bg-amber-500/20 text-amber-400 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {rb.scope}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Coords: {rb.latitude.toFixed(4)}, {rb.longitude.toFixed(4)} (Radius: {rb.radiusMeters}m)
              </p>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" /> Verified Restriction
            </span>
          </div>
        ))}
      </div>

      {/* Register New Roadblock Form */}
      <form onSubmit={handleSubmit} className="p-3 bg-navy-950 rounded-xl border border-slate-800 space-y-3 text-xs">
        <h4 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-teal-400" /> Register Verified Road Hazard
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Hazard Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-navy-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
            required
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="bg-navy-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="FULL_BLOCK">Full Road Blockade</option>
            <option value="LANE_RESTRICTION">Single Lane Restriction</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg shadow-md transition-all flex items-center justify-center gap-1.5"
        >
          <ShieldAlert className="w-3.5 h-3.5" /> Inject Roadblock & Force Reroute
        </button>
      </form>
    </div>
  );
};
