import React from 'react';
import { Activity, Building2, Home, Map, Siren, Truck } from 'lucide-react';

export type ControlRoomSection = 'overview' | 'incoming' | 'active' | 'hospitals' | 'ambulances' | 'roads';

interface HeaderProps {
  activeSection: ControlRoomSection;
  onNavigate: (section: ControlRoomSection) => void;
  emergencyCount: number;
  activeResponseCount: number;
}

const sections: { id: ControlRoomSection; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'incoming', label: 'Incoming emergencies', icon: Siren },
  { id: 'active', label: 'Active responses', icon: Activity },
  { id: 'hospitals', label: 'Hospitals & beds', icon: Building2 },
  { id: 'ambulances', label: 'Ambulances', icon: Truck },
  { id: 'roads', label: 'Roads & signals', icon: Map }
];

export const Header: React.FC<HeaderProps> = ({ activeSection, onNavigate, emergencyCount, activeResponseCount }) => (
  <aside className="control-sidebar">
    <div className="flex items-center gap-3 px-5 py-5 lg:px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white">
        <Activity className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-bold tracking-wide text-slate-900">AEGIS</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Control room</p>
      </div>
    </div>

    <nav aria-label="Control room pages" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:py-3">
      {sections.map(({ id, label, icon: Icon }) => {
        const badge = id === 'incoming' ? emergencyCount : id === 'active' ? activeResponseCount : 0;
        return (
          <button
            key={id}
            type="button"
            aria-current={activeSection === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors lg:w-full ${
              activeSection === id
                ? 'bg-teal-50 font-semibold text-teal-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">{label}</span>
            {badge > 0 && <span className="ml-auto min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white">{badge}</span>}
          </button>
        );
      })}
    </nav>

    <div className="hidden border-t border-slate-100 px-5 py-4 lg:block">
      <span className="rounded-full border border-teal-100 bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-800">Prototype</span>
      <p className="mt-3 text-xs font-medium text-slate-700">Emergency response desk</p>
      <p className="mt-0.5 text-[11px] text-slate-500">Shared operational view</p>
    </div>
  </aside>
);
