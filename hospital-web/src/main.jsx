import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Ambulance,
  Bed,
  ClipboardList,
  Database,
  History,
  Hospital,
  LogOut,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_HOSPITAL_API ?? 'http://localhost:8081/api/hospital';

const navItems = [
  ['overview', 'Overview', Activity],
  ['incoming', 'Incoming', Ambulance],
  ['arrivals', 'Arrivals', ClipboardList],
  ['resources', 'Resources', Bed],
  ['specialists', 'Specialists', Stethoscope],
  ['history', 'History', History],
  ['settings', 'Settings', Settings],
];

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [route, setRoute] = useState('overview');
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const data = await request('/overview');
      setSnapshot(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const run = async (label, fn, kind = 'ok') => {
    try {
      const data = await fn();
      setSnapshot(data);
      setToast({ title: label, kind });
      setModal(null);
    } catch (err) {
      setToast({ title: 'Action failed', body: err.message, kind: 'err' });
    }
  };

  if (loading) return <div className="login-wrap"><div className="login">Loading hospital operations...</div></div>;

  if (!snapshot) {
    return (
      <div className="login-wrap">
        <div className="login">
          <div className="brand">
            <div className="brand-mark">H</div>
            <div>
              <div className="brand-text">AEGIS Hospital</div>
              <div className="brand-sub">Backend unavailable</div>
            </div>
          </div>
          <p className="sub">{error || 'Start the Spring Boot API on port 8081.'}</p>
          <button className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  const incomingCount = snapshot.requests.filter((r) => r.status === 'OPEN').length;
  const staleResources = [...snapshot.beds, ...snapshot.equipment].filter((r) => minutesAgo(r.updatedAt) > 30).length;

  return (
    <div id="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-text">{snapshot.profile.name}</div>
            <div className="brand-sub">Hospital Operations</div>
          </div>
        </div>
        {navItems.map(([key, label, Icon]) => (
          <button key={key} className={`nav-item ${route === key ? 'active' : ''}`} onClick={() => setRoute(key)}>
            <Icon />
            <span>{label}</span>
            {key === 'incoming' && incomingCount > 0 && <span className="nav-badge">{incomingCount}</span>}
            {key === 'resources' && staleResources > 0 && <span className="nav-badge amber">{staleResources}</span>}
          </button>
        ))}
        <div className="sidebar-foot">Synthetic demo data. React UI backed by Spring Boot.</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">{titleFor(route)}</h1>
            <div className="page-sub">Live readiness, reservations, and inbound ambulance coordination</div>
          </div>
          <div className="spacer" />
          <span className="conn"><span className="dot" /> API synced</span>
          <button className="btn btn-ghost" onClick={load}><RefreshCcw size={16} /> Refresh</button>
          <div className="user"><div className="user-av">HS</div><span>Hospital Staff</span></div>
        </header>
        <section className="content">
          {route === 'overview' && <Overview snapshot={snapshot} setRoute={setRoute} />}
          {route === 'incoming' && <Incoming snapshot={snapshot} setModal={setModal} run={run} />}
          {route === 'arrivals' && <Arrivals snapshot={snapshot} run={run} />}
          {route === 'resources' && <Resources snapshot={snapshot} setModal={setModal} run={run} />}
          {route === 'specialists' && <Specialists snapshot={snapshot} setModal={setModal} run={run} />}
          {route === 'history' && <EventTable events={snapshot.history} title="Operational history" />}
          {route === 'settings' && <SettingsPage snapshot={snapshot} run={run} />}
        </section>
      </main>

      {modal && <Modal modal={modal} close={() => setModal(null)} />}
      {toast && <Toast toast={toast} clear={() => setToast(null)} />}
    </div>
  );
}

function Overview({ snapshot, setRoute }) {
  const openRequests = snapshot.requests.filter((r) => r.status === 'OPEN');
  const availableBeds = snapshot.beds.reduce((sum, bed) => sum + bed.available, 0);
  const criticalRequests = openRequests.filter((request) => request.severity >= 5).length;
  const inbound = snapshot.arrivals.filter((arrival) => arrival.status !== 'HANDOVER_COMPLETE').length;
  return (
    <div className="grid">
      <div className="grid g4">
        <Kpi label="Open requests" value={openRequests.length} hint="Awaiting hospital action" tone="pending" />
        <Kpi label="Available beds" value={availableBeds} hint="Across tracked units" tone="ready" />
        <Kpi label="Critical cases" value={criticalRequests} hint="Severity 5 inbound" tone="critical" />
        <Kpi label="Inbound arrivals" value={inbound} hint="Reserved or en route" />
      </div>
      <div className="grid g2">
        <div className="card card-pad">
          <div className="section-title">Hospital status</div>
          <dl className="kv">
            <dt>Status</dt><dd>{chip(snapshot.profile.operatingStatus)}</dd>
            <dt>Phone</dt><dd>{snapshot.profile.phone}</dd>
            <dt>Entrance</dt><dd>{snapshot.profile.entranceInstructions}</dd>
            <dt>Restrictions</dt><dd>{snapshot.profile.acceptanceRestrictions}</dd>
          </dl>
          <div className="flex-wrap mt2">
            {snapshot.profile.capabilities.map((item) => <span className="chip chip-neutral" key={item}>{item}</span>)}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Highest priority incoming</h3>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setRoute('incoming')}>Review</button>
          </div>
          <div className="card-pad">
            {openRequests.slice(0, 3).map((request) => <RequestMini key={request.id} request={request} />)}
            {openRequests.length === 0 && <Empty title="No open requests" body="All inbound requests are handled." />}
          </div>
        </div>
      </div>
      <ResourceSummary snapshot={snapshot} />
    </div>
  );
}

function Incoming({ snapshot, setModal, run }) {
  const requests = snapshot.requests;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Incoming requests</h3>
        <span className="sub">{requests.length} total</span>
      </div>
      <table>
        <thead><tr><th>Mission</th><th>Category</th><th>Ambulance</th><th>ETA</th><th>Needs</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td><strong>{request.missionRef}</strong><div className="small muted">{request.caseRef}</div></td>
              <td>{request.category}<div>{chip(`Severity ${request.severity}`)}</div></td>
              <td>{request.ambulanceCallsign}</td>
              <td className="num">{formatEta(request.etaSeconds)}</td>
              <td>{request.requestedResources.map((item) => <span className="chip chip-neutral" key={item}>{item}</span>)}</td>
              <td>{chip(request.status)}</td>
              <td>
                <div className="flex">
                  <button className="btn btn-primary btn-sm" disabled={request.status !== 'OPEN'} onClick={() => setModal(acceptModal(request, snapshot, run))}>Accept</button>
                  <button className="btn btn-danger btn-sm" disabled={request.status !== 'OPEN'} onClick={() => setModal(declineModal(request, run))}>Decline</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setModal(clarifyModal(request, run))}>Clarify</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Arrivals({ snapshot, run }) {
  return (
    <div className="grid">
      {snapshot.arrivals.length === 0 && <div className="card"><Empty title="No active arrivals" body="Accept a request to create an inbound arrival." /></div>}
      {snapshot.arrivals.map((arrival) => (
        <div className="card card-pad" key={arrival.missionRef}>
          <div className="flex">
            <h3>{arrival.missionRef}</h3>
            <div className="spacer" />
            {chip(arrival.status)}
          </div>
          <dl className="kv mt">
            <dt>Ambulance</dt><dd>{arrival.ambulanceCallsign}</dd>
            <dt>ETA</dt><dd>{formatEta(arrival.etaSeconds)}</dd>
            <dt>Updated</dt><dd>{formatDate(arrival.updatedAt)}</dd>
          </dl>
          <ul className="checklist mt2">
            {arrival.checklist.map((item) => <li className="done" key={item}><span className="cb">✓</span>{item}</li>)}
          </ul>
          <button className="btn btn-primary mt2" disabled={arrival.status === 'HANDOVER_COMPLETE'} onClick={() => run('Handover complete', () => post(`/arrivals/${arrival.missionRef}/handover`))}>
            Confirm handover
          </button>
        </div>
      ))}
    </div>
  );
}

function Resources({ snapshot, setModal, run }) {
  return (
    <div className="grid">
      <div className="card">
        <div className="card-head"><h3>Bed inventory</h3></div>
        <table>
          <thead><tr><th>Unit</th><th>Total</th><th>Avail</th><th>Reserved</th><th>Occupied</th><th>Updated</th><th></th></tr></thead>
          <tbody>{snapshot.beds.map((bed) => (
            <tr key={bed.id}>
              <td>{bed.label}<div className="small muted">{bed.kind}</div></td>
              <td className="num">{bed.total}</td>
              <td className="num"><strong>{bed.available}</strong></td>
              <td className="num">{bed.reserved}</td>
              <td className="num">{bed.occupied}</td>
              <td>{fresh(bed.updatedAt)}<div className="small muted">{bed.updatedBy}</div></td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => setModal(bedModal(bed, run))}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-head"><h3>Equipment</h3></div>
        <table>
          <thead><tr><th>Item</th><th>Total</th><th>Avail</th><th>Reserved</th><th>In use</th><th>Updated</th><th></th></tr></thead>
          <tbody>{snapshot.equipment.map((item) => (
            <tr key={item.id}>
              <td>{item.label}<div className="small muted">{item.kind}</div></td>
              <td className="num">{item.total}</td>
              <td className="num"><strong>{item.available}</strong></td>
              <td className="num">{item.reserved}</td>
              <td className="num">{item.inUse}</td>
              <td>{fresh(item.updatedAt)}<div className="small muted">{item.updatedBy}</div></td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => setModal(equipmentModal(item, run))}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-head"><h3>Theatres & diagnostics</h3></div>
        <table>
          <thead><tr><th>Asset</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>{snapshot.theatres.map((theatre) => (
            <tr key={theatre.id}><td>{theatre.label}</td><td>{chip(theatre.status)}</td><td>{fresh(theatre.updatedAt)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Specialists({ snapshot, setModal, run }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Specialist readiness</h3></div>
      <table>
        <thead><tr><th>Specialty</th><th>Clinician</th><th>Status</th><th>ETA</th><th>Updated</th><th></th></tr></thead>
        <tbody>{snapshot.specialists.map((specialist) => (
          <tr key={specialist.id}>
            <td>{specialist.specialty}</td>
            <td>{specialist.displayName || 'Unassigned'}</td>
            <td>{chip(specialist.status)}</td>
            <td>{specialist.readinessEtaMinutes == null ? '—' : `${specialist.readinessEtaMinutes} min`}</td>
            <td>{fresh(specialist.updatedAt)}<div className="small muted">{specialist.updatedBy}</div></td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => setModal(specialistModal(specialist, run))}>Update</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function SettingsPage({ snapshot, run }) {
  const [profile, setProfile] = useState(snapshot.profile);
  useEffect(() => setProfile(snapshot.profile), [snapshot.profile]);
  return (
    <div className="grid g2">
      <div className="card card-pad">
        <div className="section-title">Hospital profile</div>
        <Field label="Name" value={profile.name} onChange={(name) => setProfile({ ...profile, name })} />
        <label className="field">Operating status
          <select value={profile.operatingStatus} onChange={(event) => setProfile({ ...profile, operatingStatus: event.target.value })}>
            <option>OPERATIONAL</option><option>DIVERT</option><option>CLOSED</option>
          </select>
        </label>
        <Field multiline label="Entrance instructions" value={profile.entranceInstructions} onChange={(entranceInstructions) => setProfile({ ...profile, entranceInstructions })} />
        <Field multiline label="Acceptance restrictions" value={profile.acceptanceRestrictions} onChange={(acceptanceRestrictions) => setProfile({ ...profile, acceptanceRestrictions })} />
        <button className="btn btn-primary" onClick={() => run('Profile saved', () => put('/profile', profile))}>Save profile</button>
      </div>
      <div className="card card-pad">
        <div className="section-title">Demo controls</div>
        <p className="muted small">Reset restores seeded requests, reservations, beds, specialists, and audit history.</p>
        <button className="btn btn-danger mt" onClick={() => run('Demo reset', () => post('/reset'), 'warn')}>Reset demo scenario</button>
      </div>
    </div>
  );
}

function ResourceSummary({ snapshot }) {
  return (
    <div className="grid g2">
      <div className="card">
        <div className="card-head"><h3>Bed readiness</h3></div>
        <div className="card-pad">
          {snapshot.beds.map((bed) => <Bar key={bed.id} label={bed.label} value={bed.available} total={bed.total} />)}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Specialist coverage</h3></div>
        <div className="card-pad">
          {snapshot.specialists.map((specialist) => (
            <div className="flex mt" key={specialist.id}>
              <span>{specialist.specialty}</span><div className="spacer" />{chip(specialist.status)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventTable({ events, title }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3><span className="sub">{events.length} events</span></div>
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Target</th><th>Summary</th><th>Actor</th></tr></thead>
        <tbody>{events.map((event) => (
          <tr key={event.id}>
            <td className="num small">{formatDate(event.at)}</td>
            <td>{chip(event.type)}</td>
            <td className="mono small">{event.target}</td>
            <td>{event.summary}</td>
            <td>{event.actor}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function acceptModal(request, snapshot, run) {
  const defaultBed = request.category === 'trauma'
    ? snapshot.beds.find((bed) => bed.kind === 'ICU')
    : snapshot.beds.find((bed) => bed.kind === 'EMERGENCY') ?? snapshot.beds[0];
  const defaultEquipment = request.requestedResources.includes('VENTILATOR')
    ? snapshot.equipment.find((item) => item.kind === 'VENTILATOR')
    : snapshot.equipment.find((item) => item.kind === 'MONITOR');
  return {
    title: `Accept ${request.missionRef}`,
    body: ({ values, setValues }) => (
      <>
        <dl className="kv">
          <dt>Category</dt><dd>{request.category} · severity {request.severity}</dd>
          <dt>Ambulance</dt><dd>{request.ambulanceCallsign}</dd>
          <dt>ETA</dt><dd>{formatEta(request.etaSeconds)}</dd>
        </dl>
        <label className="field">Bed unit
          <select value={values.bedUnitId ?? defaultBed?.id} onChange={(event) => setValues({ ...values, bedUnitId: event.target.value })}>
            {snapshot.beds.map((bed) => <option key={bed.id} value={bed.id} disabled={bed.available === 0}>{bed.label} — {bed.available} available</option>)}
          </select>
        </label>
        <label className="field">Equipment
          <select value={values.equipmentId ?? defaultEquipment?.id ?? ''} onChange={(event) => setValues({ ...values, equipmentId: event.target.value })}>
            <option value="">None</option>
            {snapshot.equipment.map((item) => <option key={item.id} value={item.id} disabled={item.available === 0}>{item.label} — {item.available} available</option>)}
          </select>
        </label>
      </>
    ),
    footer: ({ values }) => (
      <button className="btn btn-primary" onClick={() => run('Reservation confirmed', () => post(`/requests/${request.id}/accept`, {
        bedUnitId: values.bedUnitId ?? defaultBed?.id,
        equipmentIds: values.equipmentId ? [values.equipmentId] : defaultEquipment ? [defaultEquipment.id] : [],
      }))}>Accept and reserve</button>
    ),
  };
}

function declineModal(request, run) {
  return {
    title: `Decline ${request.missionRef}`,
    body: ({ values, setValues }) => (
      <>
        <label className="field">Reason
          <select value={values.reason ?? 'Capacity exceeded'} onChange={(event) => setValues({ ...values, reason: event.target.value })}>
            <option>Capacity exceeded</option><option>Specialist unavailable</option><option>Equipment unavailable</option><option>Acceptance restriction</option><option>Other</option>
          </select>
        </label>
        <Field multiline label="Note to control room" value={values.note ?? ''} onChange={(note) => setValues({ ...values, note })} />
      </>
    ),
    footer: ({ values }) => (
      <button className="btn btn-danger" onClick={() => run('Request declined', () => post(`/requests/${request.id}/decline`, {
        reason: [values.reason ?? 'Capacity exceeded', values.note].filter(Boolean).join(' - '),
      }), 'warn')}>Decline request</button>
    ),
  };
}

function clarifyModal(request, run) {
  return {
    title: `Clarify ${request.missionRef}`,
    body: ({ values, setValues }) => <Field multiline label="Question for control room" value={values.question ?? ''} onChange={(question) => setValues({ ...values, question })} />,
    footer: ({ values }) => <button className="btn btn-primary" onClick={() => run('Clarification sent', () => post(`/requests/${request.id}/clarify`, { question: values.question ?? '(no question)' }))}>Send question</button>,
  };
}

function bedModal(bed, run) {
  return {
    title: `Update ${bed.label}`,
    initial: { total: bed.total, occupied: bed.occupied, unavailable: bed.unavailable },
    body: ({ values, setValues }) => (
      <div className="grid g3">
        <NumberField label="Total" value={values.total} onChange={(total) => setValues({ ...values, total })} />
        <NumberField label="Occupied" value={values.occupied} onChange={(occupied) => setValues({ ...values, occupied })} />
        <NumberField label="Unavailable" value={values.unavailable} onChange={(unavailable) => setValues({ ...values, unavailable })} />
      </div>
    ),
    footer: ({ values }) => <button className="btn btn-primary" onClick={() => run('Bed inventory updated', () => put(`/beds/${bed.id}`, values))}>Save</button>,
  };
}

function equipmentModal(item, run) {
  return {
    title: `Update ${item.label}`,
    initial: { total: item.total, inUse: item.inUse, unavailable: item.unavailable },
    body: ({ values, setValues }) => (
      <div className="grid g3">
        <NumberField label="Total" value={values.total} onChange={(total) => setValues({ ...values, total })} />
        <NumberField label="In use" value={values.inUse} onChange={(inUse) => setValues({ ...values, inUse })} />
        <NumberField label="Unavailable" value={values.unavailable} onChange={(unavailable) => setValues({ ...values, unavailable })} />
      </div>
    ),
    footer: ({ values }) => <button className="btn btn-primary" onClick={() => run('Equipment updated', () => put(`/equipment/${item.id}`, values))}>Save</button>,
  };
}

function specialistModal(specialist, run) {
  return {
    title: `Update ${specialist.specialty}`,
    initial: { status: specialist.status, readinessEtaMinutes: specialist.readinessEtaMinutes ?? 0 },
    body: ({ values, setValues }) => (
      <>
        <label className="field">Status
          <select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>
            <option>ON_DUTY</option><option>ON_CALL</option><option>CONTACTED</option><option>READY</option><option>UNAVAILABLE</option><option>UNKNOWN</option>
          </select>
        </label>
        <NumberField label="Readiness ETA minutes" value={values.readinessEtaMinutes} onChange={(readinessEtaMinutes) => setValues({ ...values, readinessEtaMinutes })} />
      </>
    ),
    footer: ({ values }) => <button className="btn btn-primary" onClick={() => run('Specialist updated', () => put(`/specialists/${specialist.id}`, values))}>Save</button>,
  };
}

function Modal({ modal, close }) {
  const [values, setValues] = useState(modal.initial ?? {});
  return (
    <div className="modal-back" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head"><h2>{modal.title}</h2><button className="close-x" onClick={close}>×</button></div>
        <div className="modal-body">{modal.body({ values, setValues })}</div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>Cancel</button>{modal.footer({ values, setValues })}</div>
      </div>
    </div>
  );
}

function Toast({ toast, clear }) {
  useEffect(() => {
    const id = setTimeout(clear, 2800);
    return () => clearTimeout(id);
  }, [clear]);
  return <div id="toasts"><div className={`toast ${toast.kind}`}><div className="toast-title">{toast.title}</div>{toast.body && <div className="toast-body">{toast.body}</div>}</div></div>;
}

function Field({ label, value, onChange, multiline }) {
  return (
    <label className="field">{label}
      {multiline
        ? <textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
        : <input value={value ?? ''} onChange={(event) => onChange(event.target.value)} />}
    </label>
  );
}

function NumberField({ label, value, onChange }) {
  return <label className="field">{label}<input type="number" min="0" value={value ?? 0} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Kpi({ label, value, hint, tone = '' }) {
  return <div className={`card kpi ${tone}`}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-hint">{hint}</div></div>;
}

function RequestMini({ request }) {
  return <div className="alert warn mt"><div><div className="alert-title">{request.missionRef} · {request.category}</div><div className="alert-body">{request.ambulanceCallsign} arriving in {formatEta(request.etaSeconds)} · {request.requestedResources.join(', ')}</div></div></div>;
}

function Empty({ title, body }) {
  return <div className="empty"><h4>{title}</h4><p>{body}</p></div>;
}

function Bar({ label, value, total }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return <div className="mt"><div className="flex"><span>{label}</span><div className="spacer" /><span className="small muted">{value}/{total}</span></div><div className={`bar ${pct < 20 ? 'danger' : pct < 45 ? 'warn' : ''}`}><i style={{ width: `${pct}%` }} /></div></div>;
}

function chip(value) {
  const text = String(value).replaceAll('_', ' ');
  const lower = text.toLowerCase();
  const tone = lower.includes('open') || lower.includes('ready') || lower.includes('operational') || lower.includes('accepted') || lower.includes('complete')
    ? 'chip-ready'
    : lower.includes('critical') || lower.includes('declined') || lower.includes('closed') || lower.includes('unavailable')
      ? 'chip-critical'
      : lower.includes('contacted') || lower.includes('pending') || lower.includes('divert') || lower.includes('severity')
        ? 'chip-pending'
        : 'chip-neutral';
  return <span className={`chip ${tone}`}><span className="d" />{text}</span>;
}

function fresh(iso) {
  const minutes = minutesAgo(iso);
  return <span className={`fresh ${minutes > 30 ? 'stale' : ''}`}>{minutes}m ago</span>;
}

function titleFor(route) {
  return {
    overview: 'Hospital Overview',
    incoming: 'Incoming Requests',
    arrivals: 'Arrivals & Handover',
    resources: 'Resources',
    specialists: 'Specialists',
    history: 'History',
    settings: 'Settings',
  }[route];
}

function formatEta(seconds) {
  if (seconds == null) return '—';
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

function minutesAgo(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatDate(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

function post(path, body = {}) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}

function put(path, body = {}) {
  return request(path, { method: 'PUT', body: JSON.stringify(body) });
}

createRoot(document.getElementById('root')).render(<App />);
