import React from 'react';
import { Radio, ArrowRight } from 'lucide-react';
import { GreenCorridorSignal } from '../types';

interface GreenCorridorSimulatorProps {
  signals: GreenCorridorSignal[];
  onUpdateState: (junctionId: string, newState: string) => void;
}

export const GreenCorridorSimulator: React.FC<GreenCorridorSimulatorProps> = ({ signals, onUpdateState }) => {
  const signalStates = [
    { code: 'UNAVAILABLE', label: 'Unavailable' },
    { code: 'REQUESTED', label: 'Requested' },
    { code: 'ACKNOWLEDGED', label: 'Acknowledged' },
    { code: 'CLEARING', label: 'Clearing traffic' },
    { code: 'ACTIVE', label: 'Green for ambulance' },
    { code: 'PASSED', label: 'Passed' },
    { code: 'EXPIRED', label: 'Expired' }
  ];

  const getNextSignalState = (current: string) => {
    const idx = signalStates.findIndex(s => s.code === current);
    if (idx >= 0 && idx < signalStates.length - 1) {
      return signalStates[idx + 1].code;
    }
    return 'UNAVAILABLE';
  };

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4 border border-slate-800">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-teal-400 animate-pulse" />
          <h3 className="font-extrabold text-sm text-white">Traffic signal status</h3>
        </div>
        <span className="font-mono text-xs font-bold text-teal-300 bg-teal-500/10 px-2.5 py-0.5 rounded border border-teal-500/30">
          Manual status updates
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {signals.map((sig) => {
          const nextState = getNextSignalState(sig.currentState);

          return (
            <div key={sig.junctionId} className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800 space-y-3">
              <div className="flex items-start justify-between gap-1">
                <div>
                  <h4 className="font-bold text-xs text-white">{sig.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{sig.junctionId}</p>
                </div>
                <span
                  className={`font-mono text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                    sig.currentState === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                      : sig.currentState === 'CLEARING'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {signalStates.find(state => state.code === sig.currentState)?.label || sig.currentState.replace(/_/g, ' ').toLowerCase()}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  {sig.activeMissionId ? `Linked response: ${sig.activeMissionId}` : 'No response linked'}
                </span>
                <button
                  onClick={() => onUpdateState(sig.junctionId, nextState)}
                  className="px-2.5 py-1 bg-teal-600/30 hover:bg-teal-600 text-teal-300 hover:text-white text-[11px] font-bold rounded-lg border border-teal-500/40 transition-all flex items-center gap-1"
                >
                  Set to {signalStates.find(state => state.code === nextState)?.label || nextState.toLowerCase()} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
