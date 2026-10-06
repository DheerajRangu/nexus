import React from 'react';
import { Activity, Building2 } from 'lucide-react';
import { EmergencyCase } from '../types';

interface ActiveMissionsListProps {
  cases: EmergencyCase[];
}

export const ActiveMissionsList: React.FC<ActiveMissionsListProps> = ({ cases }) => {
  const activeCases = cases.filter(c => c.currentState !== 'INTAKE_CREATED' && c.currentState !== 'LOCATION_CONFIRMED' && c.currentState !== 'CLOSED');

  const missionStages = [
    { code: 'DISPATCHED', label: 'Crew assigned' },
    { code: 'EN_ROUTE_PATIENT', label: 'Going to caller' },
    { code: 'PATIENT_PICKED_UP', label: 'Patient on board' },
    { code: 'EN_ROUTE_HOSPITAL', label: 'Going to hospital' },
    { code: 'ARRIVED_HOSPITAL', label: 'At hospital' },
    { code: 'HANDOVER_COMPLETE', label: 'Care handed over' }
  ];

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4 border border-slate-800">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-teal-400" />
          <h3 className="font-extrabold text-sm text-white">Responses in progress</h3>
        </div>
        <span className="font-mono text-xs font-bold text-teal-300 bg-navy-950 px-2 py-0.5 rounded border border-slate-800">
          {activeCases.length} In Progress
        </span>
      </div>

      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {activeCases.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs italic">
            No responses are underway right now.
          </div>
        ) : (
          activeCases.map((c) => {
            return (
              <div key={c.emergencyId} className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-white">{c.emergencyId}</span>
                      <span className="bg-teal-500/20 text-teal-300 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                        Ambulance: {c.assignedAmbulanceId || 'Awaiting crew'}
                      </span>
                      {c.reservedHospitalId && (
                        <span className="bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {c.reservedHospitalId}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 font-bold mt-1">{c.chiefComplaint}</p>
                  </div>

                </div>

                {/* Mission Stage Progression Bar */}
                <div className="grid grid-cols-6 gap-1 pt-1">
                  {missionStages.map((stage, idx) => {
                    const currentIdx = missionStages.findIndex(s => s.code === c.currentState);
                    const isPassed = idx < currentIdx;
                    const isCurrent = idx === currentIdx;

                    return (
                      <div key={stage.code} className="text-center">
                        <div
                          className={`h-2 rounded-full mb-1 transition-all ${
                            isCurrent
                              ? 'bg-teal-400 shadow-md shadow-teal-400/50 animate-pulse'
                              : isPassed
                              ? 'bg-emerald-500'
                              : 'bg-slate-800'
                          }`}
                        />
                        <span className={`text-[9px] font-mono block truncate ${isCurrent ? 'text-teal-300 font-bold' : 'text-slate-500'}`}>
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
