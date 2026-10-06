import React, { useState } from 'react';
import { Building2, BedDouble, CheckCircle2, Clock } from 'lucide-react';
import { HospitalRank, EmergencyCase } from '../types';

interface HospitalDecisionCardProps {
  selectedCase?: EmergencyCase;
  hospitals: HospitalRank[];
  onReserveBed: (emergencyId: string, hospitalId: string, requiredBeds: number, requiredIcu: boolean) => void;
}

export const HospitalDecisionCard: React.FC<HospitalDecisionCardProps> = ({
  selectedCase,
  hospitals,
  onReserveBed
}) => {
  const [requiredBeds] = useState(1);
  const [requiredIcu, setRequiredIcu] = useState(false);
  const [reservedHospitalId, setReservedHospitalId] = useState<string | null>(selectedCase?.reservedHospitalId || null);

  const handleReserve = (hospitalId: string) => {
    if (!selectedCase) return;
    setReservedHospitalId(hospitalId);
    onReserveBed(selectedCase.emergencyId, hospitalId, requiredBeds, requiredIcu);
  };

  if (!selectedCase) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-slate-400 text-xs italic border border-slate-800">
        Select an emergency to see hospitals with matching beds and services.
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4 border border-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-sm text-white">Hospitals that may be able to help</h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Estimated arrival includes travel time and hospital preparation time
          </p>
        </div>

        {/* Requirements Toggle */}
        <div className="flex items-center gap-3 bg-navy-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
          <label className="flex items-center gap-1.5 text-slate-300 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={requiredIcu}
              onChange={(e) => setRequiredIcu(e.target.checked)}
              className="rounded text-emerald-500 focus:ring-emerald-500"
            />
            Needs a critical care bed
          </label>
        </div>
      </div>

      {/* Hospital Ranking Table */}
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {hospitals.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            No matching hospitals found with confirmed bed availability.
          </div>
        ) : (
          hospitals.map((h, idx) => {
            const isTopRanked = idx === 0;
            const isReserved = reservedHospitalId === h.hospitalId;

            return (
              <div
                key={h.hospitalId}
                className={`p-3.5 rounded-xl border transition-all ${
                  isReserved
                    ? 'bg-emerald-50 border-emerald-300'
                    : isTopRanked
                    ? 'bg-navy-900/90 border-teal-500/50'
                    : 'bg-navy-950/60 border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-emerald-400">#{idx + 1}</span>
                      <h4 className="font-extrabold text-sm text-white">{h.name}</h4>
                      {isReserved && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Reserved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                      <span>Beds: <strong className="text-white">{h.availableBeds}</strong></span>
                      <span>Critical care: <strong className="text-emerald-400">{h.availableIcu}</strong></span>
                      <span>Specialist: {h.specialistReady ? 'Available' : 'Busy'}</span>
                    </div>
                  </div>

                  {/* Transparent Estimate Metrics & Reservation Action */}
                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono">
                      <div className="text-xs text-slate-300">
                        Drive time: <span className="font-bold text-white">{h.travelEtaMins} min</span>
                      </div>
                      <div className="text-xs text-emerald-400 font-bold flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" /> Arrival after preparation: {h.totalTransparentEstimateMins} min
                      </div>
                    </div>

                    <button
                      onClick={() => handleReserve(h.hospitalId)}
                      disabled={isReserved}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isReserved
                          ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                      }`}
                    >
                      <BedDouble className="w-3 h-3" />
                      {isReserved ? 'Bed Reserved' : 'Reserve Bed'}
                    </button>
                  </div>
                </div>

                {/* Reasons List */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                  {h.reasons.map((r, rIdx) => (
                    <div key={rIdx} className="text-[11px] text-slate-300 flex items-center gap-1.5 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
