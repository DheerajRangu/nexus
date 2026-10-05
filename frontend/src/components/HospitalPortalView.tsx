import React, { useState } from 'react';
import { Building2, BedDouble, CheckCircle2, AlertTriangle, Users, Activity, Plus } from 'lucide-react';
import { Hospital } from '../types';

interface HospitalPortalViewProps {
  hospitals: Hospital[];
  onConfirmReservation: (hospitalId: string) => void;
}

export const HospitalPortalView: React.FC<HospitalPortalViewProps> = ({ hospitals, onConfirmReservation }) => {
  const [selectedHosp, setSelectedHosp] = useState<Hospital>(hospitals[0] || {
    hospitalId: 'HOSP-CITY-GENERAL-01',
    name: 'City General Trauma & Emergency Center',
    latitude: 12.9724,
    longitude: 77.5951,
    availableBeds: 14,
    availableIcu: 3,
    hasTraumaCenter: true,
    hasCardiacCathLab: true,
    emergencyWorkload: 'NORMAL',
    resourceUpdatedAt: new Date().toISOString()
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6 px-4">
      {/* Hospital Portal Header */}
      <div className="glass-panel p-5 rounded-2xl border border-emerald-500/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">{selectedHosp.name}</h2>
            <p className="text-xs text-slate-300 font-mono">Clinician ER Portal (Dr. Aris Mehta)</p>
          </div>
        </div>
        <span className="bg-emerald-500/10 text-emerald-400 font-mono text-xs px-3 py-1 rounded-xl border border-emerald-500/30 font-bold">
          Trauma Level 1 Ready
        </span>
      </div>

      {/* Bed Capacity Management Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Available General Beds</span>
            <BedDouble className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-3xl font-black text-white font-mono">{selectedHosp.availableBeds}</div>
          <span className="text-[10px] text-emerald-400 font-mono font-bold">Confirmed by Clinician</span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Available ICU Beds</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono">{selectedHosp.availableIcu}</div>
          <span className="text-[10px] text-emerald-400 font-mono font-bold">Cath Lab Ready</span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>ER Emergency Workload</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-extrabold text-amber-400 font-mono uppercase">{selectedHosp.emergencyWorkload}</div>
          <span className="text-[10px] text-slate-400 font-mono">Prep delay ~2 mins</span>
        </div>
      </div>

      {/* Incoming Emergency Reservation Requests */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-400" />
          INCOMING AMBULANCE RESERVATION REQUESTS
        </h3>

        <div className="p-4 bg-navy-950 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded font-mono">
              CARDIAC_ARREST (P1 Critical)
            </span>
            <span className="text-xs text-slate-400 font-mono">ETA: 11.2 Mins</span>
          </div>

          <div>
            <h4 className="font-extrabold text-sm text-white">Ambulance: AMB-108-NORTH-01</h4>
            <p className="text-xs text-slate-300">Requested: 1 ICU Bed + Ventilator Support</p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              onClick={() => onConfirmReservation(selectedHosp.hospitalId)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" /> Accept & Reserve Atomic ICU Bed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
