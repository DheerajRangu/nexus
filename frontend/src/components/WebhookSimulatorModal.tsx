import React, { useState } from 'react';
import { X, Zap, ShieldCheck, Key } from 'lucide-react';

interface WebhookSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: any) => void;
}

export const WebhookSimulatorModal: React.FC<WebhookSimulatorModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [externalCallRef, setExternalCallRef] = useState('108-CALL-' + Math.floor(Math.random() * 90000));
  const [callbackNumber, setCallbackNumber] = useState('+91-9876543210');
  const [operatorId, setOperatorId] = useState('op-108-bangalore-04');
  const [rawNotes, setRawNotes] = useState('Caller reports 58 yo male with sudden onset left-sided weakness, facial drooping, and slurred speech at Brigade Road.');
  const [callerLat] = useState(12.9740);
  const [callerLng] = useState(77.6070);
  const [accuracyMeters] = useState(120.0);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      externalCallRef,
      callbackNumber,
      operatorId,
      rawNotes,
      callerLat,
      callerLng,
      accuracyMeters
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-navy-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="font-extrabold text-base text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            108 Inbound Call Webhook Event Simulator
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="p-3 bg-navy-950 rounded-xl border border-slate-800 space-y-2 font-mono">
            <div className="flex items-center justify-between text-[11px] text-teal-400 font-bold">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Signature Header:
              </span>
              <span className="text-slate-400">X-Aegis-Signature: sha256=...</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-teal-400 font-bold">
              <span className="flex items-center gap-1">
                <Key className="w-3.5 h-3.5" /> Idempotency Header:
              </span>
              <span className="text-slate-400">X-Idempotency-Key: idemp-88219</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">External Call Reference ID</label>
            <input
              type="text"
              value={externalCallRef}
              onChange={(e) => setExternalCallRef(e.target.value)}
              className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Callback Phone Number</label>
            <input
              type="text"
              value={callbackNumber}
              onChange={(e) => setCallbackNumber(e.target.value)}
              className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Operator Notes (Triggers NLP NLP Engine)</label>
            <textarea
              rows={3}
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-navy-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl shadow-lg shadow-amber-500/20"
            >
              Emit Webhook Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
