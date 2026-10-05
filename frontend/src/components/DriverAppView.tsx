import React, { useState } from 'react';
import { Truck, Navigation, CheckCircle2, XCircle, ArrowRight, MapPin, Building2, Radio } from 'lucide-react';
import { Mission, Ambulance } from '../types';

interface DriverAppViewProps {
  onAcceptOffer: () => void;
  onDeclineOffer: () => void;
  onProgressMission: (stage: string) => void;
}

export const DriverAppView: React.FC<DriverAppViewProps> = ({ onAcceptOffer, onDeclineOffer, onProgressMission }) => {
  const [offerState, setOfferState] = useState<'PENDING' | 'ACCEPTED' | 'DECLINED'>('PENDING');
  const [missionStage, setMissionStage] = useState<string>('DISPATCHED');

  const handleAccept = () => {
    setOfferState('ACCEPTED');
    onAcceptOffer();
  };

  const handleDecline = () => {
    setOfferState('DECLINED');
    onDeclineOffer();
  };

  const handleProgress = (next: string) => {
    setMissionStage(next);
    onProgressMission(next);
  };

  return (
    <div className="max-w-sm mx-auto space-y-4 py-4 px-3">
      {/* Mobile Device Frame Header */}
      <div className="glass-panel p-4 rounded-3xl border-2 border-teal-500/40 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="font-extrabold text-sm text-white">AEGIS DRIVER MOBILE</h3>
              <p className="text-[10px] text-slate-400 font-mono">AMB-108-NORTH-01 (Rajesh Kumar)</p>
            </div>
          </div>
          <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> GPS Live
          </span>
        </div>

        {/* Incoming Dispatch Offer Card */}
        {offerState === 'PENDING' && (
          <div className="p-4 bg-amber-500/10 rounded-2xl border-2 border-amber-500/50 space-y-3 animate-pulse">
            <div className="flex items-center justify-between">
              <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded font-mono">
                NEW DISPATCH OFFER
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">30s TTL</span>
            </div>

            <div>
              <span className="text-xs text-slate-400 font-mono">Incident ID: emg-883a-4912</span>
              <h4 className="font-black text-sm text-white mt-0.5">CARDIAC_ARREST (P1 Critical)</h4>
              <p className="text-xs text-slate-300 mt-1">Location: MG Road Metro Plaza (3.2 km away)</p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={handleDecline}
                className="py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold text-xs rounded-xl border border-red-500/40 flex items-center justify-center gap-1"
              >
                <XCircle className="w-4 h-4" /> Decline
              </button>
              <button
                onClick={handleAccept}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" /> Accept Offer
              </button>
            </div>
          </div>
        )}

        {/* Accepted Mission Control Screen */}
        {offerState === 'ACCEPTED' && (
          <div className="space-y-3">
            <div className="p-3 bg-navy-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">Current Stage</span>
                <span className="bg-teal-500/20 text-teal-300 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                  {missionStage}
                </span>
              </div>
              <h4 className="font-bold text-sm text-white">Mission: msn-demo-883a</h4>
              <p className="text-xs text-slate-300">Target: City General ER Center</p>
            </div>

            {/* Stage Action Buttons */}
            <div className="space-y-2">
              {missionStage === 'DISPATCHED' && (
                <button
                  onClick={() => handleProgress('EN_ROUTE_PATIENT')}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  Start Vehicle Navigation <Navigation className="w-4 h-4" />
                </button>
              )}
              {missionStage === 'EN_ROUTE_PATIENT' && (
                <button
                  onClick={() => handleProgress('PATIENT_PICKED_UP')}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  Confirm Patient Loaded <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
              {missionStage === 'PATIENT_PICKED_UP' && (
                <button
                  onClick={() => handleProgress('EN_ROUTE_HOSPITAL')}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  Navigate to Hospital ER <Building2 className="w-4 h-4" />
                </button>
              )}
              {missionStage === 'EN_ROUTE_HOSPITAL' && (
                <button
                  onClick={() => handleProgress('ARRIVED_HOSPITAL')}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  Confirm Arrived at ER <MapPin className="w-4 h-4" />
                </button>
              )}
              {missionStage === 'ARRIVED_HOSPITAL' && (
                <button
                  onClick={() => handleProgress('HANDOVER_COMPLETE')}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  Complete ER Handover <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {offerState === 'DECLINED' && (
          <div className="p-4 bg-navy-950 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
            Offer declined. Vehicle returned to idle pool.
          </div>
        )}
      </div>
    </div>
  );
};
