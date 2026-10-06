import React, { useState } from 'react';
import { PhoneCall, Plus, CheckCircle2, AlertCircle, Send, FileText } from 'lucide-react';
import { EmergencyCase, SmsOutbox } from '../types';

const priorityLabels: Record<EmergencyCase['triagePriority'], string> = {
  P1_CRITICAL: 'Immediate',
  P2_URGENT: 'Urgent',
  P3_STANDARD: 'Standard'
};

const caseStateLabels: Record<EmergencyCase['currentState'], string> = {
  INTAKE_CREATED: 'New',
  LOCATION_CONFIRMED: 'Location confirmed',
  DISPATCHING: 'Finding an ambulance',
  DISPATCHED: 'Crew assigned',
  EN_ROUTE_PATIENT: 'Going to caller',
  PATIENT_PICKED_UP: 'Patient on board',
  EN_ROUTE_HOSPITAL: 'Going to hospital',
  ARRIVED_HOSPITAL: 'At hospital',
  HANDOVER_COMPLETE: 'Care handed over',
  CLOSED: 'Closed'
};

interface CallIntakeQueueProps {
  cases: EmergencyCase[];
  smsOutbox: SmsOutbox[];
  onOpenManualModal: () => void;
  onSelectCase: (caseId: string) => void;
  selectedCaseId?: string;
}

export const CallIntakeQueue: React.FC<CallIntakeQueueProps> = ({
  cases,
  smsOutbox,
  onOpenManualModal,
  onSelectCase,
  selectedCaseId
}) => {
  const [showOutboxDrawer, setShowOutboxDrawer] = useState(false);

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-4 border border-slate-800">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhoneCall className="w-5 h-5 text-teal-400" />
          <h2 className="font-extrabold text-base tracking-wide text-white">Incoming emergencies</h2>
          <span className="bg-teal-500/20 text-teal-300 font-mono text-xs px-2 py-0.5 rounded-full font-bold">
            {cases.length} Active Cases
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenManualModal}
            className="bg-teal-600 hover:bg-teal-500 text-white text-xs px-3.5 py-1.5 rounded-lg shadow-lg shadow-teal-600/30 flex items-center gap-1.5 font-semibold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add emergency
          </button>
        </div>
      </div>

      {/* Case List */}
      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {cases.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs italic">
            No emergencies yet. Add an emergency to get started.
          </div>
        ) : (
          cases.map((c) => {
            const isSelected = c.emergencyId === selectedCaseId;
            return (
              <div
                key={c.emergencyId}
                onClick={() => onSelectCase(c.emergencyId)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-navy-800 border-teal-500 shadow-lg shadow-teal-500/10'
                    : 'bg-navy-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full font-mono ${
                        c.triagePriority === 'P1_CRITICAL'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                          : c.triagePriority === 'P2_URGENT'
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                      }`}
                    >
                      {priorityLabels[c.triagePriority]}
                    </span>
                    <span className="font-mono font-bold text-xs text-white">{c.emergencyId}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {caseStateLabels[c.currentState]}
                  </span>
                </div>

                <div className="mt-1.5">
                  <h4 className="font-bold text-xs text-teal-300">{c.chiefComplaint || 'Emergency Incident'}</h4>
                  <p className="text-xs text-slate-300 line-clamp-2 mt-0.5">{c.rawOperatorNotes}</p>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">Callback: {c.callbackNumber}</span>
                  <div className="flex items-center gap-1">
                    {c.locationConfirmed ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Location Confirmed
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1 font-semibold">
                        <AlertCircle className="w-3 h-3 animate-pulse" /> Location Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* SMS Outbox Drawer Trigger */}
      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
        <button
          onClick={() => setShowOutboxDrawer(!showOutboxDrawer)}
          className="text-slate-400 hover:text-teal-300 flex items-center gap-1.5 transition-colors font-mono"
        >
          <Send className="w-3.5 h-3.5 text-teal-400" />
          Text message status ({smsOutbox.length})
        </button>
        {smsOutbox.some(s => s.status === 'FAILED') && (
          <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Message not delivered
          </span>
        )}
      </div>

      {/* SMS Outbox List Drawer */}
      {showOutboxDrawer && (
        <div className="bg-navy-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
          <h4 className="text-slate-300 font-bold flex items-center gap-1.5 text-xs">
            <FileText className="w-3.5 h-3.5 text-teal-400" /> Recent text messages
          </h4>
          {smsOutbox.map((msg) => (
            <div key={msg.outboxId} className="p-2 rounded bg-navy-900 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-teal-400 font-bold">{msg.recipientPhone}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${msg.status === 'SENT' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400 font-bold'}`}>
                  {msg.status === 'SENT' ? 'Sent' : msg.status === 'PENDING' ? 'Waiting to send' : 'Not delivered'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">{msg.messageText}</p>
              {msg.failureReason && (
                <p className="text-[10px] text-red-400 font-semibold">{msg.failureReason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
