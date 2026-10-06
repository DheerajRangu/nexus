export type Resource = {
  id: string;
  kind: string;
  status: string;
  incidentId: string | null;
  patientId: string | null;
  updatedAt: string;
};
export type Staff = {
  id: string;
  name: string;
  role: string;
  status: string;
  etaSeconds: number;
};
export type Team = {
  id: string;
  name: string;
  incidentId: string | null;
  members: Staff[];
};
export type Task = {
  id: string;
  label: string;
  status: string;
  resourceId: string | null;
};
export type Preparation = {
  incidentId: string;
  patientId: string;
  status: string;
  tasks: Task[];
  teamId: string | null;
  startedAt: string | null;
  readyAt?: string;
  handoverStartedAt: string | null;
  handoverChecklist: Record<string, boolean>;
  handover: Record<string, string>;
  conflicts: string[];
  receivedAt: string | null;
  report?: {
    handoverSeconds: number;
    preparedBeforeArrival: boolean;
    readyBeforeArrival: boolean;
    resourceIds: string[];
    simulation: boolean;
    timeSavedSeconds: null;
  };
};
export type HospitalOperations = {
  hospitalId: string;
  demo: boolean;
  resources: Resource[];
  blood: Record<
    string,
    { available: number; reserved: Record<string, number> }
  >;
  teams: Team[];
  preparations: Record<string, Preparation>;
  messages: {
    id: string;
    incidentId: string | null;
    sender: string;
    text: string;
    channel: string;
    createdAt: string;
  }[];
  alerts: {
    id: string;
    text: string;
    incidentId: string | null;
    createdAt: string;
    acknowledged: boolean;
  }[];
  audit: {
    eventId: string;
    type: string;
    occurredAt: string;
    details: Record<string, unknown>;
  }[];
  policy: Record<string, boolean>;
  massCasualty: boolean;
  diversionReason: string;
  board: {
    incidentId: string;
    patientId: string;
    name: string;
    priority: string;
    location: string;
    teamId: string;
    status: string;
    receivedAt: string;
  }[];
  demoControl: {
    running: boolean;
    elapsed: number;
    speed: number;
    applied: number[];
    incidentId?: string;
  };
  staffCounts: { doctors: number; nurses: number; specialists: number };
};
