import React, { useState } from 'react';
import { X, Phone, FileText, MapPin, Building, AlertTriangle } from 'lucide-react';

interface ManualIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => void;
}

export const ManualIntakeModal: React.FC<ManualIntakeModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [callbackNumber, setCallbackNumber] = useState('+91-9876543210');
  const [chiefComplaint, setChiefComplaint] = useState('CARDIAC_ARREST');
  const [priority, setPriority] = useState('P1_CRITICAL');
  const [notes, setNotes] = useState('Caller reports severe chest pain and collapse near MG Road Metro station entrance gate 2.');
  const [addressLandmark, setAddressLandmark] = useState('MG Road Metro Station Entrance Gate 2');
  const [buildingDetails, setBuildingDetails] = useState('Ground floor entrance near ticketing booth');
  const [provisionalDispatch, setProvisionalDispatch] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      callbackNumber,
      chiefComplaint,
      priority,
      notes,
      addressLandmark,
      buildingDetails,
      provisionalDispatch
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-navy-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
            <Phone className="w-5 h-5 text-teal-400" />
            108 Manual Call Intake Form
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Callback Phone Number</label>
            <input
              type="text"
              value={callbackNumber}
              onChange={(e) => setCallbackNumber(e.target.value)}
              className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:border-teal-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Chief Complaint</label>
              <select
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
              >
                <option value="CARDIAC_ARREST">Cardiac Arrest / Severe Chest Pain</option>
                <option value="TRAUMA">Trauma / Heavy Bleeding</option>
                <option value="STROKE">Stroke / Paralysis</option>
                <option value="RESPIRATORY">Respiratory Distress</option>
                <option value="OBSTETRIC">Obstetric Emergency</option>
                <option value="GENERAL_EMERGENCY">General Emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Triage Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold focus:border-teal-500 focus:outline-none"
              >
                <option value="P1_CRITICAL" className="text-red-400 font-bold">P1 - Critical (Immediate ALS)</option>
                <option value="P2_URGENT" className="text-orange-400 font-bold">P2 - Urgent (BLS/ALS)</option>
                <option value="P3_STANDARD" className="text-blue-400 font-bold">P3 - Standard Transport</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Operator Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
              placeholder="Record symptoms, caller observations..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Landmark / Address</label>
              <input
                type="text"
                value={addressLandmark}
                onChange={(e) => setAddressLandmark(e.target.value)}
                className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Building & Floor Details</label>
              <input
                type="text"
                value={buildingDetails}
                onChange={(e) => setBuildingDetails(e.target.value)}
                className="w-full bg-navy-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 flex items-start gap-2">
            <input
              type="checkbox"
              id="provDispatch"
              checked={provisionalDispatch}
              onChange={(e) => setProvisionalDispatch(e.target.checked)}
              className="mt-0.5 rounded text-amber-500 focus:ring-amber-500"
            />
            <label htmlFor="provDispatch" className="text-slate-300 cursor-pointer">
              <span className="font-bold text-amber-400 block">Authorize Provisional Dispatch (Uncertain Location)</span>
              <span className="text-[11px] text-slate-400">Location is approximate. Dispatch nearest unit immediately while caller location confirmation is in progress.</span>
            </label>
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
              className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-lg shadow-teal-600/30"
            >
              Submit & Open Case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
