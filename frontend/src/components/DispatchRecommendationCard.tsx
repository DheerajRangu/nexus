import React, { useEffect, useState } from 'react';
import { Clock, Truck } from 'lucide-react';
import { AmbulanceRank, DispatchOffer, EmergencyCase } from '../types';

interface Props {
  selectedCase?: EmergencyCase;
  ranks: AmbulanceRank[];
  offers: DispatchOffer[];
  onDispatchOffer: (emergencyId: string, ambulanceId: string) => void;
}

export const DispatchRecommendationCard: React.FC<Props> = ({ selectedCase, ranks, offers, onDispatchOffer }) => {
  const [now, setNow] = useState(Date.now());
  const openOffer = offers.find(offer => offer.status === 'OFFERED');
  const acceptedOffer = offers.find(offer => offer.status === 'ACCEPTED');

  useEffect(() => {
    if (!openOffer) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [openOffer?.offerId]);

  if (!selectedCase) return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Choose an emergency to see the nearest suitable response teams.</section>;

  const secondsLeft = openOffer ? Math.max(0, Math.ceil((new Date(openOffer.expiresAt).getTime() - now) / 1000)) : 0;
  const selectedAmbulance = acceptedOffer?.ambulanceId ?? openOffer?.ambulanceId;

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2 text-slate-900"><Truck className="h-5 w-5 text-teal-700" /><h2 className="text-sm font-semibold">Nearest suitable response teams</h2></div>
          <p className="mt-1 text-xs text-slate-500">Rechecked as ambulance locations and road reports change. Travel times are simulated in this preview.</p>
        </div>
        <span className="rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600">{selectedCase.emergencyId}</span>
      </header>

      {!selectedCase.locationConfirmed && <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Confirm the patient’s location before the system sends a response offer.</div>}
      {acceptedOffer && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{acceptedOffer.ambulanceId} accepted the response request.</div>}
      {openOffer && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span>The system offered this emergency to <strong>{openOffer.ambulanceId}</strong>. Waiting for the crew.</span><span className="inline-flex items-center gap-1 font-semibold"><Clock className="h-3.5 w-3.5" />{secondsLeft}s left</span></div>}
      {!acceptedOffer && !openOffer && offers.some(offer => offer.status === 'DECLINED' || offer.status === 'EXPIRED') && <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">A crew could not accept. The system is checking the next available team.</div>}

      {ranks.length === 0 ? <p className="rounded-md bg-slate-50 p-4 text-center text-xs text-slate-600">{selectedCase.locationConfirmed ? 'No suitable team is available with a fresh location and a clear route.' : 'Share or confirm the patient’s location to calculate the best response.'}</p> : (
        <ol className="space-y-2">
          {ranks.map((ambulance, index) => (
            <li key={ambulance.ambulanceId} className={`rounded-md border p-3 ${index === 0 ? 'border-teal-200 bg-teal-50/50' : 'border-slate-100 bg-white'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{index === 0 ? 'Best match' : `Option ${index + 1}`} · {ambulance.ambulanceId}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{ambulance.capabilityTier === 'ALS' ? 'Advanced care' : ambulance.capabilityTier === 'BLS' ? 'Basic care' : 'Patient transport'} · {ambulance.distanceKm.toFixed(1)} km · about {ambulance.correctedEtaMins.toFixed(1)} min ({ambulance.routingProvider})</p>
                </div>
                {selectedAmbulance === ambulance.ambulanceId && <span className="rounded-full bg-teal-100 px-2 py-1 text-[10px] font-semibold text-teal-900">Current offer</span>}
              </div>
              <p className="mt-2 text-[11px] text-slate-600">{ambulance.reasons.join(' · ')}</p>
            </li>
          ))}
        </ol>
      )}

      <details className="border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">Choose a different team manually</summary>
        <p className="mt-2 text-[11px] text-slate-500">Use only when the recommended offer needs an operator override.</p>
        <div className="mt-2 flex flex-wrap gap-2">{ranks.map(ambulance => <button key={ambulance.ambulanceId} type="button" disabled={!selectedCase.locationConfirmed || !!acceptedOffer} onClick={() => onDispatchOffer(selectedCase.emergencyId, ambulance.ambulanceId)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:border-teal-600 hover:text-teal-800 disabled:opacity-50">Offer to {ambulance.ambulanceId}</button>)}</div>
      </details>
    </section>
  );
};
