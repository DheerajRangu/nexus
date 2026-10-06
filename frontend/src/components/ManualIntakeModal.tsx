import React, { useState } from 'react';
import { X, Phone } from 'lucide-react';

interface ManualIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => void;
}

export const ManualIntakeModal: React.FC<ManualIntakeModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [callbackNumber, setCallbackNumber] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [priority, setPriority] = useState('');
  const [notes, setNotes] = useState('');
  const [addressLandmark, setAddressLandmark] = useState('');
  const [buildingDetails, setBuildingDetails] = useState('');
  const [provisionalDispatch, setProvisionalDispatch] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

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
      provisionalDispatch,
      latitude: latitude === '' ? null : Number(latitude),
      longitude: longitude === '' ? null : Number(longitude),
      accuracyMeters: latitude && longitude ? 50 : null
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
            <Phone className="w-5 h-5 text-teal-700" />
            Add an emergency
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Caller phone number</label>
            <input
              type="tel"
              value={callbackNumber}
              onChange={(e) => setCallbackNumber(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono focus:border-teal-700 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Chief Complaint</label>
              <select
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none"
                required
              >
                <option value="">Choose the main concern</option>
                <option value="CARDIAC_ARREST">Chest pain or collapse</option>
                <option value="TRAUMA">Injury or heavy bleeding</option>
                <option value="STROKE">Possible stroke</option>
                <option value="RESPIRATORY">Trouble breathing</option>
                <option value="OBSTETRIC">Pregnancy emergency</option>
                <option value="GENERAL_EMERGENCY">Other emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Urgency</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:border-teal-700 focus:outline-none"
                required
              >
                <option value="">Choose how urgent</option>
                <option value="P1_CRITICAL" className="text-red-400 font-bold">Immediate - life at risk</option>
                <option value="P2_URGENT" className="text-orange-400 font-bold">Urgent - needs prompt care</option>
                <option value="P3_STANDARD" className="text-blue-400 font-bold">Standard - needs transport</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-slate-600 font-medium">Map latitude (optional)<input type="number" step="any" value={latitude} onChange={e => setLatitude(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" placeholder="For example, 12.97" /></label>
            <label className="block text-slate-600 font-medium">Map longitude (optional)<input type="number" step="any" value={longitude} onChange={e => setLongitude(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" placeholder="For example, 77.59" /></label>
          </div>
          <p className="text-[11px] text-slate-500">If you do not have map coordinates yet, leave these blank. The emergency will stay marked as location unconfirmed.</p>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">What happened?</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none"
              placeholder="Record symptoms, caller observations..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Address or nearby landmark</label>
              <input
                type="text"
                value={addressLandmark}
                onChange={(e) => setAddressLandmark(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Building or floor details</label>
              <input
                type="text"
                value={buildingDetails}
                onChange={(e) => setBuildingDetails(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none"
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
            <label htmlFor="provDispatch" className="text-slate-700 cursor-pointer">
              <span className="font-bold text-amber-700 block">Send an ambulance before the location is confirmed</span>
              <span className="text-[11px] text-slate-500">The address may be approximate. The caller’s location will still need to be confirmed.</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-navy-800 hover:bg-slate-700 text-slate-700 rounded-xl font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-slate-900 font-bold rounded-xl shadow-lg shadow-teal-600/30"
            >
              Create emergency
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

