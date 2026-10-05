import React from 'react';
import { Shield, Activity, PhoneCall, Truck, Building2, MapPin, BarChart3, RefreshCw, AlertTriangle, Radio } from 'lucide-react';

interface HeaderProps {
  activeView: string;
  setActiveView: (view: string) => void;
  onResetSystem: () => void;
  onInjectScenario: (type: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeView, setActiveView, onResetSystem, onInjectScenario }) => {
  return (
    <header className="bg-navy-900 border-b border-slate-800 sticky top-0 z-50 px-4 py-3 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveView('controlroom')}>
          <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-2.5 rounded-xl shadow-lg shadow-teal-500/20">
            <Shield className="w-6 h-6 text-slate-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-white via-slate-200 to-teal-400 bg-clip-text text-transparent">
                AEGIS CONTROL ROOM
              </h1>
              <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE CORE
              </span>
            </div>
            <p className="text-xs text-slate-400">Integrated Emergency Dispatch & Operational Network</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-navy-950/80 p-1.5 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveView('controlroom')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'controlroom' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'text-slate-400 hover:text-white hover:bg-navy-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Control Dashboard
          </button>
          <button
            onClick={() => setActiveView('driver')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'driver' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'text-slate-400 hover:text-white hover:bg-navy-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Driver App View
          </button>
          <button
            onClick={() => setActiveView('hospital')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'hospital' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'text-slate-400 hover:text-white hover:bg-navy-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Hospital ER Portal
          </button>
          <button
            onClick={() => setActiveView('citizen')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'citizen' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'text-slate-400 hover:text-white hover:bg-navy-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Citizen Tracking
          </button>
          <button
            onClick={() => setActiveView('analytics')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeView === 'analytics' ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30' : 'text-slate-400 hover:text-white hover:bg-navy-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            AI & Analytics
          </button>
        </nav>

        {/* Demo Controls & Injection Menu */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onInjectScenario('full_hospitals')}
            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/30 flex items-center gap-1.5 transition-all font-mono"
            title="Inject Hospital Full Scenario"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Full Beds
          </button>
          <button
            onClick={onResetSystem}
            className="bg-navy-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all"
            title="Reset Database State"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset State
          </button>
        </div>
      </div>
    </header>
  );
};
