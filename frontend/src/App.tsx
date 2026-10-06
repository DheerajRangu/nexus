import React, { useState, useEffect } from 'react';
import { ControlRoomSection, Header } from './components/Header';
import { LiveMap } from './components/LiveMap';
import { CallIntakeQueue } from './components/CallIntakeQueue';
import { ManualIntakeModal } from './components/ManualIntakeModal';
import { DispatchRecommendationCard } from './components/DispatchRecommendationCard';
import { HospitalDecisionCard } from './components/HospitalDecisionCard';
import { ActiveMissionsList } from './components/ActiveMissionsList';
import { AmbulanceStatusGrid } from './components/AmbulanceStatusGrid';
import { RoadblockManager } from './components/RoadblockManager';
import { GreenCorridorSimulator } from './components/GreenCorridorSimulator';
import { aegisApi } from './services/api';
import { EmergencyCase, IncidentLocation, Ambulance, Hospital, AmbulanceRank, HospitalRank, DispatchOffer, Mission, MissionRoute, Roadblock, GreenCorridorSignal, SmsOutbox } from './types';

export function App() {
  const [activeSection, setActiveSection] = useState<ControlRoomSection>('overview');
  const [authenticated, setAuthenticated] = useState(aegisApi.hasToken());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<'connecting' | 'connected' | 'unavailable'>('connecting');
  
  // App State
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [locations, setLocations] = useState<IncidentLocation[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionRoutes, setMissionRoutes] = useState<MissionRoute[]>([]);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [roadblocks, setRoadblocks] = useState<Roadblock[]>([]);
  const [signals, setSignals] = useState<GreenCorridorSignal[]>([]);
  const [smsOutbox, setSmsOutbox] = useState<SmsOutbox[]>([]);
  
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>(undefined);
  const [ambRanks, setAmbRanks] = useState<AmbulanceRank[]>([]);
  const [hospRanks, setHospRanks] = useState<HospitalRank[]>([]);
  const [dispatchOffers, setDispatchOffers] = useState<DispatchOffer[]>([]);
  
  // Modals
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Load initial operational data
  const loadData = async () => {
    setServiceStatus('connecting');
    const [loadedCases, loadedLocations, loadedAmbs, loadedHosps, loadedRbs, loadedSigs, loadedSms, loadedMissions] = await Promise.all([
      aegisApi.getCases(), aegisApi.getLocations(), aegisApi.getAmbulances(), aegisApi.getHospitals(),
      aegisApi.getRoadblocks(), aegisApi.getCorridorSignals(), aegisApi.getSmsOutbox(), aegisApi.getActiveMissions()
    ]);

    setCases(loadedCases);
    setLocations(loadedLocations);
    setAmbulances(loadedAmbs);
    setHospitals(loadedHosps);
    setRoadblocks(loadedRbs);
    setSignals(loadedSigs);
    setSmsOutbox(loadedSms);
    setMissions(loadedMissions);
    const routes = await Promise.allSettled(loadedMissions.map(mission => aegisApi.getMissionRoute(mission.missionId)));
    setMissionRoutes(routes.flatMap(route => route.status === 'fulfilled' ? [route.value] : []));
    setServiceStatus('connected');
    try { setDemoAvailable((await aegisApi.getDemoStatus()).enabled); } catch { setDemoAvailable(false); }

    if (loadedCases.length > 0 && (!selectedCaseId || !loadedCases.some(c => c.emergencyId === selectedCaseId))) {
      setSelectedCaseId(loadedCases[0].emergencyId);
    }
  };

  const handleApiError = (e: unknown) => {
    setServiceStatus('unavailable');
    if ((e as { status?: number })?.status === 401) {
      aegisApi.clearToken();
      setAuthenticated(false);
    }
    setError(e instanceof Error ? e.message : 'The operation failed.');
  };

  useEffect(() => {
    if (authenticated) loadData().catch(handleApiError);
  }, [authenticated]);

  // Compute rankings when selected case changes
  useEffect(() => {
    if (selectedCaseId) {
      Promise.all([
        aegisApi.shortlistAmbulances(selectedCaseId), aegisApi.rankHospitals(selectedCaseId), aegisApi.getDispatchOffers(selectedCaseId)
      ]).then(([ambulances, hospitals, offers]) => {
        setAmbRanks(ambulances); setHospRanks(hospitals); setDispatchOffers(offers);
      }).catch(handleApiError);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    const refreshOperationalData = async () => {
      try {
        const [freshCases, freshLocations, freshAmbulances, freshHospitals, freshRoadblocks, freshSignals, freshSms, freshMissions] = await Promise.all([
          aegisApi.getCases(), aegisApi.getLocations(), aegisApi.getAmbulances(), aegisApi.getHospitals(),
          aegisApi.getRoadblocks(), aegisApi.getCorridorSignals(), aegisApi.getSmsOutbox(), aegisApi.getActiveMissions()
        ]);
        if (stopped) return;
        setCases(freshCases); setLocations(freshLocations); setAmbulances(freshAmbulances); setHospitals(freshHospitals);
        setRoadblocks(freshRoadblocks); setSignals(freshSignals); setSmsOutbox(freshSms); setMissions(freshMissions);
        if (selectedCaseId) {
          const [ambulanceRanks, hospitalRanks, offers] = await Promise.all([
            aegisApi.shortlistAmbulances(selectedCaseId), aegisApi.rankHospitals(selectedCaseId), aegisApi.getDispatchOffers(selectedCaseId)
          ]);
          if (!stopped) { setAmbRanks(ambulanceRanks); setHospRanks(hospitalRanks); setDispatchOffers(offers); }
        }
        const routes = await Promise.allSettled(freshMissions.map(mission => aegisApi.getMissionRoute(mission.missionId)));
        if (!stopped) {
          setMissionRoutes(routes.flatMap(route => route.status === 'fulfilled' ? [route.value] : []));
          setServiceStatus('connected');
        }
      } catch (e) {
        if (!stopped && (e as { status?: number })?.status === 401) handleApiError(e);
      }
    };
    const timer = window.setInterval(refreshOperationalData, 10000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [authenticated, selectedCaseId]);

  // Handlers
  const runDemoAction = async (action: () => Promise<unknown>) => {
    setDemoBusy(true);
    try {
      setError('');
      const result = await action();
      if (result && typeof result === 'object' && 'emergencyId' in result) {
        setSelectedCaseId(String((result as { emergencyId: unknown }).emergencyId));
      }
      await loadData();
    }
    catch (e) { handleApiError(e); }
    finally { setDemoBusy(false); }
  };

  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
  };

  const handleManualIntakeSubmit = (formData: any) => runAction(async () => {
    const created = await aegisApi.createManualIntake(formData);
    await loadData();
    if (created) setSelectedCaseId(created.emergencyId);
  });

  const handleDispatchOffer = (emergencyId: string, ambulanceId: string) => runAction(async () => {
    await aegisApi.createDispatchOffer(emergencyId, ambulanceId);
    setDispatchOffers(await aegisApi.getDispatchOffers(emergencyId));
    await loadData();
  });

  const handleReserveBed = (emergencyId: string, hospitalId: string, requiredBeds: number, requiredIcu: boolean) => runAction(async () => {
    await aegisApi.reserveHospitalBed(emergencyId, hospitalId, requiredBeds, requiredIcu);
    await loadData();
  });

  const handleCreateRoadblock = (payload: any) => runAction(async () => {
    await aegisApi.createRoadblock(payload);
    await loadData();
  });

  const handleUpdateSignalState = (junctionId: string, state: string) => runAction(async () => {
    await aegisApi.updateSignalState(junctionId, state);
    await loadData();
  });

  const selectedCase = cases.find(c => c.emergencyId === selectedCaseId);
  const activeResponses = cases.filter(c => !['INTAKE_CREATED', 'LOCATION_CONFIRMED', 'CLOSED'].includes(c.currentState));
  const incomingCount = cases.filter(c => ['INTAKE_CREATED', 'LOCATION_CONFIRMED', 'DISPATCHING'].includes(c.currentState)).length;
  const pageInfo: Record<ControlRoomSection, { title: string; description: string }> = {
    overview: { title: 'Overview', description: 'A clear view of emergencies, response teams, and hospitals.' },
    incoming: { title: 'Incoming emergencies', description: 'Review caller details and choose the next response.' },
    active: { title: 'Active responses', description: 'Follow ambulance progress and current availability.' },
    hospitals: { title: 'Hospitals & beds', description: 'Check available beds and choose a suitable hospital.' },
    ambulances: { title: 'Ambulances', description: 'See which teams are available and how far away they are.' },
    roads: { title: 'Roads & signals', description: 'Review reported road closures and traffic signal changes.' }
  };

  const runAction = async (action: () => Promise<void>) => {
    try { setError(''); await action(); }
    catch (e) { handleApiError(e); }
  };

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await aegisApi.login(username, password);
      aegisApi.saveToken(result.token);
      setAuthenticated(true);
    } catch (e) {
      if ((e as { status?: number })?.status === 401) {
        setError('Those sign-in details did not work. Check your username and password, or contact your system administrator.');
      } else {
        setError(e instanceof Error ? e.message : 'Sign in failed.');
      }
    }
    finally { setBusy(false); }
  };

  const logout = () => { aegisApi.clearToken(); setAuthenticated(false); setCases([]); setAmbulances([]); setHospitals([]); };
  const refresh = async () => { try { setError(''); await loadData(); } catch (e) { handleApiError(e); } };

  if (!authenticated) return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8] p-6 text-slate-800">
      <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 font-bold text-white">A</span><div><h1 className="text-xl font-bold">AEGIS</h1><p className="text-xs text-slate-500">Control room</p></div></div>
        <p className="text-sm text-slate-600">Sign in with your control-room account to view and coordinate emergencies.</p>
        <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-xs text-teal-900"><p className="font-semibold">Local training account</p><p className="mt-1">Username: <code>operator1</code> · Password: <code>password</code></p><button type="button" onClick={() => { setUsername('operator1'); setPassword('password'); }} className="mt-2 font-semibold underline">Fill training sign-in</button><p className="mt-1 text-teal-800">Available when the backend starts with the <code>demo</code> profile.</p></div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <label className="block text-sm font-medium">Work username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-100" required /></label>
        <label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-100" required /></label>
        <button disabled={busy} className="w-full rounded-lg bg-teal-700 px-4 py-2.5 font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-800 lg:flex">
      <Header activeSection={activeSection} onNavigate={setActiveSection} emergencyCount={incomingCount} activeResponseCount={activeResponses.length} />
      <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 lg:px-8">
        <div><h1 className="text-lg font-semibold text-slate-900">{pageInfo[activeSection].title}</h1><p className="mt-0.5 text-xs text-slate-500">{pageInfo[activeSection].description}</p></div>
        <div className="flex items-center gap-4">
          <span className={`hidden items-center gap-2 text-xs sm:flex ${serviceStatus === 'connected' ? 'text-emerald-700' : serviceStatus === 'unavailable' ? 'text-red-700' : 'text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${serviceStatus === 'connected' ? 'bg-emerald-500' : serviceStatus === 'unavailable' ? 'bg-red-500' : 'bg-amber-500'}`} />{serviceStatus === 'connected' ? 'Service connected' : serviceStatus === 'unavailable' ? 'Service unavailable' : 'Connecting'}</span>
          <span className="hidden text-xs text-slate-600 md:block">{username}</span>
          <button onClick={logout} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Sign out</button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-5 lg:p-7">
        {demoAvailable && <section className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-100 bg-white p-3 shadow-sm" aria-label="Demo controls">
          <span className="mr-auto text-sm font-semibold text-slate-800">Training demo <span className="font-normal text-slate-500">· simulated routes and sample data</span></span>
          <button disabled={demoBusy} onClick={() => runDemoAction(async () => { await aegisApi.resetSystem(); return aegisApi.runDemoScenario(); })} className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{demoBusy ? 'Working…' : 'Run full scenario'}</button>
          <button disabled={demoBusy} onClick={() => runDemoAction(() => aegisApi.resetSystem())} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">Reset training data</button>
          <select disabled={demoBusy} aria-label="Choose a training scenario" className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs" defaultValue="" onChange={e => { const kind = e.target.value; if (kind) void runDemoAction(() => aegisApi.injectDemoScenario(kind)); e.target.value = ''; }}>
            <option value="">Try a situation…</option><option value="driverRejection">Driver declines</option><option value="fullHospital">Hospital is full</option><option value="competingAssignments">Two teams offered</option><option value="aiDown">Decision support unavailable</option>
          </select>
        </section>}
        {error && <div role="alert" className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><button onClick={refresh} className="font-medium underline">Try again</button></div>}
        {activeSection === 'overview' && <div className="space-y-5">
            {/* City map and incoming emergencies */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <LiveMap
                  ambulances={ambulances}
                  hospitals={hospitals}
                  cases={cases}
                  locations={locations}
                  routes={missionRoutes}
                  roadblocks={roadblocks}
                  signals={signals}
                  selectedCaseId={selectedCaseId}
                  onSelectCase={handleSelectCase}
                />
              </div>

              <div>
                <CallIntakeQueue
                  cases={cases}
                  smsOutbox={smsOutbox}
                  onOpenManualModal={() => setIsManualModalOpen(true)}
                  onSelectCase={handleSelectCase}
                  selectedCaseId={selectedCaseId}
                />
              </div>
            </div>

            {/* Nearby response teams and hospitals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DispatchRecommendationCard
                selectedCase={selectedCase}
                ranks={ambRanks}
                offers={dispatchOffers}
                onDispatchOffer={handleDispatchOffer}
              />

              <HospitalDecisionCard
                selectedCase={selectedCase}
                hospitals={hospRanks}
                onReserveBed={handleReserveBed}
              />
            </div>

            {/* Active responses and ambulance availability */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <ActiveMissionsList cases={cases} />
              </div>

              <div>
                <AmbulanceStatusGrid ambulances={ambulances} />
              </div>
            </div>

            {/* Traffic signals and reported road closures */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <GreenCorridorSimulator
                  signals={signals}
                  onUpdateState={handleUpdateSignalState}
                />
              </div>

              <div>
                <RoadblockManager
                  roadblocks={roadblocks}
                  onCreateRoadblock={handleCreateRoadblock}
                />
              </div>
            </div>
        </div>}

        {activeSection === 'incoming' && <div className="space-y-5">
          <CallIntakeQueue cases={cases} smsOutbox={smsOutbox} onOpenManualModal={() => setIsManualModalOpen(true)} onSelectCase={handleSelectCase} selectedCaseId={selectedCaseId} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <DispatchRecommendationCard selectedCase={selectedCase} ranks={ambRanks} offers={dispatchOffers} onDispatchOffer={handleDispatchOffer} />
            <HospitalDecisionCard selectedCase={selectedCase} hospitals={hospRanks} onReserveBed={handleReserveBed} />
          </div>
        </div>}

        {activeSection === 'active' && <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <ActiveMissionsList cases={cases} />
            <LiveMap ambulances={ambulances} hospitals={hospitals} cases={cases} locations={locations} routes={missionRoutes} roadblocks={roadblocks} signals={signals} selectedCaseId={selectedCaseId} onSelectCase={handleSelectCase} />
          </div>
          <AmbulanceStatusGrid ambulances={ambulances} />
        </div>}

        {activeSection === 'hospitals' && <div className="space-y-5">
          <HospitalDecisionCard selectedCase={selectedCase} hospitals={hospRanks} onReserveBed={handleReserveBed} />
          <section aria-label="Hospital capacity" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {hospitals.map(hospital => <article key={hospital.hospitalId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-slate-900">{hospital.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{hospital.emergencyWorkload === 'NORMAL' ? 'Usual activity' : hospital.emergencyWorkload === 'HIGH' ? 'Busy' : 'Very busy'}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">Beds available</p><p className="mt-1 text-xl font-semibold text-slate-900">{hospital.availableBeds}</p></div>
                <div className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">Critical care beds</p><p className="mt-1 text-xl font-semibold text-slate-900">{hospital.availableIcu}</p></div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Updated {new Date(hospital.resourceUpdatedAt).toLocaleString()}</p>
            </article>)}
            {hospitals.length === 0 && <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Hospital capacity is not available right now.</p>}
          </section>
        </div>}

        {activeSection === 'ambulances' && <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <DispatchRecommendationCard selectedCase={selectedCase} ranks={ambRanks} offers={dispatchOffers} onDispatchOffer={handleDispatchOffer} />
            <LiveMap ambulances={ambulances} hospitals={hospitals} cases={cases} locations={locations} routes={missionRoutes} roadblocks={roadblocks} signals={signals} selectedCaseId={selectedCaseId} onSelectCase={handleSelectCase} />
          </div>
          <AmbulanceStatusGrid ambulances={ambulances} />
        </div>}

        {activeSection === 'roads' && <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <LiveMap ambulances={ambulances} hospitals={hospitals} cases={cases} locations={locations} routes={missionRoutes} roadblocks={roadblocks} signals={signals} selectedCaseId={selectedCaseId} onSelectCase={handleSelectCase} />
            <GreenCorridorSimulator signals={signals} onUpdateState={handleUpdateSignalState} />
          </div>
          <RoadblockManager roadblocks={roadblocks} onCreateRoadblock={handleCreateRoadblock} />
        </div>}
      </main>

      {/* Modals */}
      <ManualIntakeModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSubmit={handleManualIntakeSubmit}
      />

      </div>
    </div>
  );
}

export default App;
