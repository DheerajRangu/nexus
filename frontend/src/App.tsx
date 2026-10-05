import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LiveMap } from './components/LiveMap';
import { CallIntakeQueue } from './components/CallIntakeQueue';
import { ManualIntakeModal } from './components/ManualIntakeModal';
import { WebhookSimulatorModal } from './components/WebhookSimulatorModal';
import { DispatchRecommendationCard } from './components/DispatchRecommendationCard';
import { HospitalDecisionCard } from './components/HospitalDecisionCard';
import { ActiveMissionsList } from './components/ActiveMissionsList';
import { AmbulanceStatusGrid } from './components/AmbulanceStatusGrid';
import { RoadblockManager } from './components/RoadblockManager';
import { GreenCorridorSimulator } from './components/GreenCorridorSimulator';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { CitizenTrackingView } from './components/CitizenTrackingView';
import { DriverAppView } from './components/DriverAppView';
import { HospitalPortalView } from './components/HospitalPortalView';

import { aegisApi } from './services/api';
import { EmergencyCase, Ambulance, Hospital, AmbulanceRank, HospitalRank, Roadblock, GreenCorridorSignal, SmsOutbox } from './types';

export function App() {
  const [activeView, setActiveView] = useState('controlroom');
  
  // App State
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [roadblocks, setRoadblocks] = useState<Roadblock[]>([]);
  const [signals, setSignals] = useState<GreenCorridorSignal[]>([]);
  const [smsOutbox, setSmsOutbox] = useState<SmsOutbox[]>([]);
  
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>(undefined);
  const [ambRanks, setAmbRanks] = useState<AmbulanceRank[]>([]);
  const [hospRanks, setHospRanks] = useState<HospitalRank[]>([]);
  
  // Modals
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);

  // Load initial operational data
  const loadData = async () => {
    const loadedCases = await aegisApi.getCases();
    const loadedAmbs = await aegisApi.getAmbulances();
    const loadedHosps = await aegisApi.getHospitals();
    const loadedRbs = await aegisApi.getRoadblocks();
    const loadedSigs = await aegisApi.getCorridorSignals();
    const loadedSms = await aegisApi.getSmsOutbox();

    setCases(loadedCases);
    setAmbulances(loadedAmbs);
    setHospitals(loadedHosps);
    setRoadblocks(loadedRbs);
    setSignals(loadedSigs);
    setSmsOutbox(loadedSms);

    if (loadedCases.length > 0 && !selectedCaseId) {
      setSelectedCaseId(loadedCases[0].emergencyId);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute rankings when selected case changes
  useEffect(() => {
    if (selectedCaseId) {
      aegisApi.shortlistAmbulances(selectedCaseId).then(setAmbRanks);
      aegisApi.rankHospitals(selectedCaseId).then(setHospRanks);
    }
  }, [selectedCaseId]);

  // Handlers
  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
  };

  const handleManualIntakeSubmit = async (formData: any) => {
    const created = await aegisApi.createManualIntake(formData);
    await loadData();
    if (created) setSelectedCaseId(created.emergencyId);
  };

  const handleWebhookSubmit = async (payload: any) => {
    const created = await aegisApi.createWebhookIntake(payload);
    await loadData();
    if (created) setSelectedCaseId(created.emergencyId);
  };

  const handleDispatchOffer = async (emergencyId: string, ambulanceId: string) => {
    await aegisApi.createDispatchOffer(emergencyId, ambulanceId);
    await loadData();
  };

  const handleReserveBed = async (emergencyId: string, hospitalId: string, requiredBeds: number, requiredIcu: boolean) => {
    await aegisApi.reserveHospitalBed(emergencyId, hospitalId, requiredBeds, requiredIcu);
    await loadData();
  };

  const handleTransitionMission = async (missionId: string, nextState: string) => {
    await aegisApi.transitionMission(missionId, nextState);
    await loadData();
  };

  const handleCreateRoadblock = async (payload: any) => {
    await aegisApi.createRoadblock(payload);
    await loadData();
  };

  const handleUpdateSignalState = async (junctionId: string, state: string) => {
    await aegisApi.updateSignalState(junctionId, state);
    await loadData();
  };

  const handleResetSystem = async () => {
    await aegisApi.resetSystem();
    await loadData();
    setSelectedCaseId(undefined);
  };

  const selectedCase = cases.find(c => c.emergencyId === selectedCaseId);

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col">
      <Header
        activeView={activeView}
        setActiveView={setActiveView}
        onResetSystem={handleResetSystem}
        onInjectScenario={(type) => {
          if (type === 'full_hospitals') {
            setHospitals(hospitals.map(h => ({ ...h, availableBeds: 0, availableIcu: 0 })));
          }
        }}
      />

      <main className="flex-1 p-4 max-w-7xl w-full mx-auto space-y-6">
        {/* VIEW 1: MAIN CONTROL ROOM DASHBOARD */}
        {activeView === 'controlroom' && (
          <div className="space-y-6">
            {/* Top Grid: City Map & 108 Call Intake Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <LiveMap
                  ambulances={ambulances}
                  hospitals={hospitals}
                  cases={cases}
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
                  onOpenWebhookModal={() => setIsWebhookModalOpen(true)}
                  onSelectCase={handleSelectCase}
                  selectedCaseId={selectedCaseId}
                />
              </div>
            </div>

            {/* Middle Grid: Dispatch Recommendation Engine & Hospital Decision Engine */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DispatchRecommendationCard
                selectedCase={selectedCase}
                ranks={ambRanks}
                onDispatchOffer={handleDispatchOffer}
              />

              <HospitalDecisionCard
                selectedCase={selectedCase}
                hospitals={hospRanks}
                onReserveBed={handleReserveBed}
              />
            </div>

            {/* Bottom Grid: Active Missions Timeline & Ambulance Telemetry */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <ActiveMissionsList
                  cases={cases}
                  onTransitionState={handleTransitionMission}
                />
              </div>

              <div>
                <AmbulanceStatusGrid ambulances={ambulances} />
              </div>
            </div>

            {/* Green Corridor 3-Junction Traffic Simulator & Roadblock Hazard Manager */}
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
          </div>
        )}

        {/* VIEW 2: CITIZEN TRACKING VIEW */}
        {activeView === 'citizen' && (
          <CitizenTrackingView
            onConfirmLocation={(lat, lng, address) => {
              if (selectedCaseId) {
                aegisApi.confirmLocation(selectedCaseId, { latitude: lat, longitude: lng, address });
              }
            }}
          />
        )}

        {/* VIEW 3: AMBULANCE DRIVER FLUTTER APP VIEW */}
        {activeView === 'driver' && (
          <DriverAppView
            onAcceptOffer={() => {
              if (selectedCaseId) {
                aegisApi.respondToOffer('off-demo', 'ACCEPT');
                loadData();
              }
            }}
            onDeclineOffer={() => {
              if (selectedCaseId) {
                aegisApi.respondToOffer('off-demo', 'DECLINE');
                loadData();
              }
            }}
            onProgressMission={(stage) => {
              if (selectedCaseId) {
                aegisApi.transitionMission('msn-demo-' + selectedCaseId.substring(4, 8), stage);
                loadData();
              }
            }}
          />
        )}

        {/* VIEW 4: HOSPITAL ER PORTAL VIEW */}
        {activeView === 'hospital' && (
          <HospitalPortalView
            hospitals={hospitals}
            onConfirmReservation={(hospitalId) => {
              if (selectedCaseId) {
                aegisApi.reserveHospitalBed(selectedCaseId, hospitalId, 1, true);
                loadData();
              }
            }}
          />
        )}

        {/* VIEW 5: AI & OPERATIONAL ANALYTICS */}
        {activeView === 'analytics' && (
          <AnalyticsPanel />
        )}
      </main>

      {/* Modals */}
      <ManualIntakeModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSubmit={handleManualIntakeSubmit}
      />

      <WebhookSimulatorModal
        isOpen={isWebhookModalOpen}
        onClose={() => setIsWebhookModalOpen(false)}
        onSubmit={handleWebhookSubmit}
      />
    </div>
  );
}

export default App;
