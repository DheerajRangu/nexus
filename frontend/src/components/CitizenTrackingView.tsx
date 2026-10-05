import React, { useState } from 'react';
import { MapPin, Navigation, Clock, ShieldCheck, CheckCircle2, PhoneCall, Building2 } from 'lucide-react';

interface CitizenTrackingViewProps {
  onConfirmLocation: (lat: number, lng: number, address: string) => void;
}

export const CitizenTrackingView: React.FC<CitizenTrackingViewProps> = ({ onConfirmLocation }) => {
  const [address, setAddress] = useState('MG Road Metro Station Gate 2, Bangalore');
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirmLocation(12.9716, 77.5946, address);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 py-6 px-4">
      {/* Citizen Header */}
      <div className="glass-panel p-5 rounded-2xl border border-teal-500/40 text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto border border-teal-500/40">
          <Navigation className="w-6 h-6 animate-pulse" />
        </div>
        <h2 className="text-lg font-extrabold text-white">AEGIS CITIZEN EMERGENCY TRACKING</h2>
        <p className="text-xs text-slate-300">
          Secure Session Token: <span className="font-mono text-teal-400 font-bold">tk_9f8a7c6b5d4e</span>
        </p>
      </div>

      {/* Location Confirmation Card */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400" />
          Step 1: Confirm Exact Incident Location
        </h3>

        {!confirmed ? (
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Your Location Address / Landmark</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-navy-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium"
              />
            </div>

            <div className="p-3 bg-navy-950 rounded-xl border border-slate-800 flex items-center justify-between text-slate-300">
              <span>GPS Accuracy Radius:</span>
              <span className="font-mono text-emerald-400 font-bold">± 12.0 meters</span>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <CheckCircle2 className="w-4 h-4" /> Confirm Pinpoint Location
            </button>
          </div>
        ) : (
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 text-xs space-y-1">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Location Confirmed & Transmitted to Control Room
            </span>
            <p className="text-slate-300">{address}</p>
          </div>
        )}
      </div>

      {/* Live Ambulance ETA & Status */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-400" />
            Assigned Response Unit
          </h3>
          <span className="bg-teal-500/20 text-teal-300 font-mono text-xs px-2.5 py-0.5 rounded font-bold">
            EN ROUTE PATIENT
          </span>
        </div>

        <div className="p-4 bg-navy-950 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="font-extrabold text-base text-white">AMB-108-NORTH-01</h4>
            <p className="text-xs text-slate-400 font-mono">KA-01-EQ-9012 (ALS Unit)</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-mono">Estimated Arrival</span>
            <span className="text-xl font-black text-emerald-400 font-mono">7.2 Mins</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
          <span className="text-slate-400">Emergency Helpline Contact:</span>
          <a href="tel:108" className="text-teal-400 font-bold flex items-center gap-1 font-mono">
            <PhoneCall className="w-3.5 h-3.5" /> Call 108 Helpline
          </a>
        </div>
      </div>
    </div>
  );
};
