import React, { useState, useEffect } from 'react';
import { Truck, Clock, ShieldCheck, Send, CheckCircle, AlertOctagon, HelpCircle } from 'lucide-react';
import { AmbulanceRank, EmergencyCase } from '../types';

interface DispatchRecommendationCardProps {
  selectedCase?: EmergencyCase;
  ranks: AmbulanceRank[];
  onDispatchOffer: (emergencyId: string, ambulanceId: string) => void;
}

export const DispatchRecommendationCard: React.FC<DispatchRecommendationCardProps> = ({
  selectedCase,
  ranks,
  onDispatchOffer
}) => {
  const [activeOfferAmbulanceId, setActiveOfferAmbulanceId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(30);

  useEffect(() => {
    let timer: any;
    if (activeOfferAmbulanceId && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setActiveOfferAmbulanceId(null);
    }
    return () => clearInterval(timer);
  }, [activeOfferAmbulanceId, countdown]);

  const handleSendOffer = (ambId: string) => {
    if (!selectedCase) return;
    setActiveOfferAmbulanceId(ambId);
    setCountdown(30);
    onDispatchOffer(selectedCase.emergencyId, ambId);
  };

  if (!selectedCase) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-slate-400 text-xs italic border border-slate-800">
        Select an emergency case from the queue to compute candidate ambulance rankings.
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4 border border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-400" />
            <h3 className="font-extrabold text-sm text-white">DISPATCH ENGINE: CANDIDATE RANKINGS</h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Filtered by capability ({selectedCase.triagePriority}), distance, and traffic-corrected ETA
          </p>
        </div>
        <span className="font-mono text-xs font-bold text-teal-300 bg-navy-950 px-2.5 py-1 rounded-lg border border-slate-800">
          Case: {selectedCase.emergencyId}
        </span>
      </div>

      {/* Offer Expiry Countdown Banner if active */}
      {activeOfferAmbulanceId && (
        <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <Clock className="w-4 h-4 animate-spin" />
            <span>DISPATCH OFFER SENT TO DRIVER (30s TTL Expiry)</span>
          </div>
          <span className="text-white text-sm font-extrabold bg-amber-500/20 px-2.5 py-0.5 rounded border border-amber-500/40">
            {countdown}s Remaining
          </span>
        </div>
      )}

      {/* Ambulance Candidate List */}
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {ranks.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            No candidate ambulances available in geographical sector.
          </div>
        ) : (
          ranks.map((amb, idx) => {
            const isTopRanked = idx === 0;
            const isOfferingThis = activeOfferAmbulanceId === amb.ambulanceId;

            return (
              <div
                key={amb.ambulanceId}
                className={`p-3.5 rounded-xl border transition-all ${
                  isTopRanked
                    ? 'bg-navy-900/90 border-teal-500/60 shadow-lg shadow-teal-500/10'
                    : 'bg-navy-950/60 border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-teal-300">#{idx + 1}</span>
                      <span className="font-extrabold text-sm text-white">{amb.ambulanceId}</span>
                      <span className="bg-teal-500/20 text-teal-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                        {amb.capabilityTier}
                      </span>
                      {isTopRanked && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/40">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">Plate: {amb.licensePlate}</p>
                  </div>

                  {/* ETA Metrics & Dispatch Action */}
                  <div className="flex items-center gap-4">
                    <div className="text-right font-mono">
                      <div className="text-xs text-slate-300">
                        Dist: <span className="font-bold text-white">{amb.distanceKm} km</span>
                      </div>
                      <div className="text-xs text-emerald-400 font-bold flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" /> ETA: {amb.correctedEtaMins} mins
                      </div>
                      <div className="text-[10px] text-slate-500 line-through">
                        Map Base: {amb.rawEtaMins}m
                      </div>
                    </div>

                    <button
                      onClick={() => handleSendOffer(amb.ambulanceId)}
                      disabled={!!activeOfferAmbulanceId}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isOfferingThis
                          ? 'bg-amber-500 text-slate-950 animate-pulse'
                          : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-600/30 disabled:opacity-50'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      {isOfferingThis ? 'Offering...' : 'Offer Dispatch'}
                    </button>
                  </div>
                </div>

                {/* Explicit Reasons Rationale List */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                  {amb.reasons.map((r, rIdx) => (
                    <div key={rIdx} className="text-[11px] text-slate-300 flex items-center gap-1.5 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
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
