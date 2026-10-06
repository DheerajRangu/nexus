import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  Clock,
  Hospital,
  Link2,
  MapPin,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  User
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_CONTROL_ROOM_API ?? 'http://localhost:8082/api/control-room';

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await request('/snapshot');
      setSnapshot(data);
    } catch (err) {
      setError('Control room API is offline. Start Spring Boot on port 8082.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  const runAction = async (action) => {
    try {
      setBusyAction(action);
      setError('');
      const data = await request(`/${action}`, { method: 'POST' });
      setSnapshot(data);
    } catch (err) {
      setError('Action failed. Check the control room API console.');
    } finally {
      setBusyAction('');
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      runAction('tick');
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(() => snapshot?.metrics ?? {}, [snapshot]);

  if (loading && !snapshot) {
    return (
      <main className="page center-state">
        <RefreshCw className="spin" size={34} />
        <p>Connecting to AEGIS command...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow"><ShieldCheck size={16} /> Emergency Operations</p>
          <h1>AEGIS Command</h1>
          <p className="subtitle">Live ambulance dispatch, hospital capacity, and incident tracking.</p>
        </div>
        <div className="actions">
          <span className="live"><Radio size={16} /> Live</span>
          <button type="button" onClick={load} disabled={busyAction !== ''} title="Refresh snapshot">
            <RefreshCw size={18} /> Refresh
          </button>
          <button type="button" onClick={() => runAction('reset')} disabled={busyAction !== ''} title="Reset demo">
            <RotateCcw size={18} /> Reset
          </button>
          <button type="button" className="primary" onClick={() => runAction('assign')} disabled={busyAction !== ''} title="Assign available unit">
            <Ambulance size={18} /> Assign Unit
          </button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      <section className="metrics" aria-label="Operations metrics">
        <Metric label="Available units" value={metrics.availableAmbulances ?? 0} icon={Ambulance} />
        <Metric label="Open incidents" value={metrics.openIncidents ?? 0} icon={AlertTriangle} />
        <Metric label="Critical incidents" value={metrics.criticalIncidents ?? 0} icon={Activity} />
        <Metric label="Hospitals online" value={snapshot?.hospitals?.length ?? 0} icon={Hospital} />
      </section>

      <section className="dashboard">
        <Panel title="Ambulances" icon={Ambulance}>
          {(snapshot?.ambulances ?? []).map((unit) => (
            <article key={unit.id} className="card">
              <div className="card-head">
                <strong>{unit.id}</strong>
                <span className={`tag ${unit.status}`}>{unit.status}</span>
              </div>
              <Line icon={User} text={unit.driver} />
              <Line icon={MapPin} text={`${unit.lat.toFixed(4)}, ${unit.lng.toFixed(4)}`} />
              <Line icon={Clock} text={unit.eta === null ? 'Ready for dispatch' : `${unit.eta} min ETA`} />
              <Line icon={Link2} text={unit.incident ? `${unit.incident} -> ${unit.hospital}` : 'No active assignment'} />
            </article>
          ))}
        </Panel>

        <Panel title="Active Incidents" icon={AlertTriangle}>
          {(snapshot?.incidents ?? []).map((incident) => (
            <article key={incident.id} className="card">
              <div className="card-head">
                <strong>{incident.id}</strong>
                <span className={`tag ${incident.priority}`}>{incident.priority}</span>
              </div>
              <h3>{incident.type}</h3>
              <Line icon={MapPin} text={incident.location} />
              <Line icon={User} text={`Citizen ${incident.citizen}`} />
              <Line icon={Ambulance} text={incident.assigned ? `Assigned ${incident.assigned}` : 'Awaiting unit'} />
            </article>
          ))}
        </Panel>

        <Panel title="Hospitals" icon={Hospital}>
          {(snapshot?.hospitals ?? []).map((hospital) => (
            <article key={hospital.id} className="card">
              <div className="card-head">
                <strong>{hospital.name}</strong>
                <span className={`tag ${capacityClass(hospital.capacity)}`}>{hospital.capacity}%</span>
              </div>
              <Line icon={MapPin} text={hospital.location} />
              <Line icon={Activity} text={`${hospital.beds} beds available`} />
              <Line icon={ShieldCheck} text={`${hospital.trauma} trauma`} />
              <div className="capacity">
                <span style={{ width: `${hospital.capacity}%` }} />
              </div>
            </article>
          ))}
        </Panel>

        <Panel title="Operational Log" icon={Terminal}>
          <div className="log">
            {(snapshot?.logs ?? []).map((entry, index) => (
              <p key={`${entry.time}-${index}`}>
                <time>{entry.time}</time>
                <span>{entry.msg}</span>
              </p>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <article className="metric">
      <Icon size={22} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="panel">
      <h2><Icon size={19} /> {title}</h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Line({ icon: Icon, text }) {
  return (
    <p className="line">
      <Icon size={15} />
      <span>{text}</span>
    </p>
  );
}

function capacityClass(capacity) {
  if (capacity >= 85) return 'critical';
  if (capacity >= 70) return 'high';
  return 'available';
}

createRoot(document.getElementById('root')).render(<App />);
