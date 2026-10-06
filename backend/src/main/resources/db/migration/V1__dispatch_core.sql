CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE missions (
  id UUID PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  emergency_id VARCHAR(80) NOT NULL UNIQUE,
  status VARCHAR(40) NOT NULL,
  urgency VARCHAR(20) NOT NULL,
  pickup GEOGRAPHY(POINT,4326) NOT NULL,
  location_confirmation VARCHAR(20) NOT NULL,
  location_source VARCHAR(80) NOT NULL,
  location_accuracy_meters DOUBLE PRECISION,
  location_captured_at TIMESTAMPTZ NOT NULL,
  address TEXT NOT NULL,
  landmark TEXT,
  access_instructions TEXT,
  required_equipment TEXT NOT NULL,
  required_crew TEXT NOT NULL,
  required_capacity INTEGER NOT NULL,
  operational_notes TEXT,
  confirming_operator VARCHAR(120) NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX missions_pickup_gix ON missions USING GIST (pickup);

CREATE TABLE ambulances (
  id VARCHAR(80) PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  driver_id VARCHAR(80) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL,
  active_shift BOOLEAN NOT NULL,
  vehicle_ready BOOLEAN NOT NULL,
  equipment_ready BOOLEAN NOT NULL,
  crew_ready BOOLEAN NOT NULL,
  maintenance_restricted BOOLEAN NOT NULL DEFAULT false,
  capacity INTEGER NOT NULL,
  equipment_capabilities TEXT NOT NULL,
  crew_capabilities TEXT NOT NULL,
  latest_position GEOGRAPHY(POINT,4326),
  latest_accuracy_meters DOUBLE PRECISION,
  latest_bearing_degrees DOUBLE PRECISION,
  latest_speed_mps DOUBLE PRECISION,
  latest_captured_at TIMESTAMPTZ,
  latest_tracking_session_id UUID,
  latest_sequence BIGINT,
  telemetry_flagged BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ambulances_position_gix ON ambulances USING GIST (latest_position);

CREATE TABLE assignments (
  id UUID PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 0,
  mission_id UUID NOT NULL REFERENCES missions(id),
  ambulance_id VARCHAR(80) NOT NULL REFERENCES ambulances(id),
  driver_id VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  assigned_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  pickup_change_acknowledged_at TIMESTAMPTZ,
  acknowledgement_deadline_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX active_assignment_per_mission ON assignments(mission_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX active_assignment_per_ambulance ON assignments(ambulance_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX active_assignment_per_driver ON assignments(driver_id) WHERE status = 'ACTIVE';

CREATE TABLE pickup_revisions (
  id UUID PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id),
  mission_version_before BIGINT NOT NULL,
  pickup GEOGRAPHY(POINT,4326) NOT NULL,
  location_confirmation VARCHAR(20) NOT NULL,
  location_source VARCHAR(80) NOT NULL,
  accuracy_meters DOUBLE PRECISION,
  address TEXT NOT NULL,
  landmark TEXT,
  access_instructions TEXT,
  justification TEXT NOT NULL,
  corrected_by VARCHAR(120) NOT NULL,
  corrected_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE telemetry_points (
  ambulance_id VARCHAR(80) NOT NULL REFERENCES ambulances(id),
  tracking_session_id UUID NOT NULL,
  sequence_number BIGINT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  position GEOGRAPHY(POINT,4326) NOT NULL,
  accuracy_meters DOUBLE PRECISION NOT NULL,
  bearing_degrees DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  flagged BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (ambulance_id, tracking_session_id, sequence_number)
);

CREATE TABLE event_outbox (
  id UUID PRIMARY KEY,
  aggregate_type VARCHAR(80) NOT NULL,
  aggregate_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  schema_version VARCHAR(20) NOT NULL,
  entity_version BIGINT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ
);
CREATE INDEX event_outbox_unpublished_idx ON event_outbox(published_at) WHERE published_at IS NULL;

CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  actor VARCHAR(120) NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  action VARCHAR(120) NOT NULL,
  mission_id UUID,
  assignment_id UUID,
  detail JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE operational_problems (
  id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  category VARCHAR(80) NOT NULL,
  detail TEXT NOT NULL,
  reported_by VARCHAR(80) NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(120)
);

CREATE TABLE driver_push_tokens (
  token VARCHAR(512) PRIMARY KEY,
  driver_id VARCHAR(80) NOT NULL,
  platform VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL
);
