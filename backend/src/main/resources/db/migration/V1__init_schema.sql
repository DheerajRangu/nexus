-- AEGIS Core Operational Database Schema

CREATE TABLE users (
    user_id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    entity_scope_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hospitals (
    hospital_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    available_beds INT NOT NULL DEFAULT 0,
    available_icu INT NOT NULL DEFAULT 0,
    has_trauma_center BOOLEAN NOT NULL DEFAULT FALSE,
    has_cardiac_cath_lab BOOLEAN NOT NULL DEFAULT FALSE,
    emergency_workload VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
    resource_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE specialist_availability (
    id VARCHAR(64) PRIMARY KEY,
    hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(hospital_id),
    specialty VARCHAR(100) NOT NULL,
    on_duty_count INT NOT NULL DEFAULT 0,
    is_ready BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ambulances (
    ambulance_id VARCHAR(64) PRIMARY KEY,
    license_plate VARCHAR(30) NOT NULL UNIQUE,
    capability_tier VARCHAR(50) NOT NULL, -- ALS, BLS, PATIENT_TRANSPORT
    has_ventilator BOOLEAN NOT NULL DEFAULT FALSE,
    has_defibrillator BOOLEAN NOT NULL DEFAULT FALSE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    telemetry_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'IDLE',
    assigned_driver_id VARCHAR(64) REFERENCES users(user_id),
    entity_version INT NOT NULL DEFAULT 1
);

CREATE TABLE driver_shifts (
    shift_id VARCHAR(64) PRIMARY KEY,
    driver_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
    ambulance_id VARCHAR(64) NOT NULL REFERENCES ambulances(ambulance_id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE emergency_cases (
    emergency_id VARCHAR(64) PRIMARY KEY,
    external_call_ref VARCHAR(100),
    callback_number VARCHAR(30) NOT NULL,
    operator_id VARCHAR(64) REFERENCES users(user_id),
    chief_complaint VARCHAR(100),
    triage_priority VARCHAR(30) NOT NULL DEFAULT 'P3_STANDARD',
    raw_operator_notes TEXT,
    location_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    provisional_dispatch BOOLEAN NOT NULL DEFAULT FALSE,
    current_state VARCHAR(50) NOT NULL DEFAULT 'INTAKE_CREATED',
    assigned_ambulance_id VARCHAR(64) REFERENCES ambulances(ambulance_id),
    reserved_hospital_id VARCHAR(64) REFERENCES hospitals(hospital_id),
    entity_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE incident_locations (
    location_id VARCHAR(64) PRIMARY KEY,
    emergency_id VARCHAR(64) NOT NULL UNIQUE REFERENCES emergency_cases(emergency_id),
    caller_lat DOUBLE PRECISION,
    caller_lng DOUBLE PRECISION,
    caller_accuracy_meters DOUBLE PRECISION,
    confirmed_lat DOUBLE PRECISION,
    confirmed_lng DOUBLE PRECISION,
    confirmed_address TEXT,
    building_floor_notes TEXT,
    location_source VARCHAR(50) NOT NULL DEFAULT 'CALLER_GPS',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dispatch_offers (
    offer_id VARCHAR(64) PRIMARY KEY,
    emergency_id VARCHAR(64) NOT NULL REFERENCES emergency_cases(emergency_id),
    ambulance_id VARCHAR(64) NOT NULL REFERENCES ambulances(ambulance_id),
    driver_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
    status VARCHAR(30) NOT NULL DEFAULT 'OFFERED', -- OFFERED, ACCEPTED, DECLINED, EXPIRED
    offered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE missions (
    mission_id VARCHAR(64) PRIMARY KEY,
    emergency_id VARCHAR(64) NOT NULL UNIQUE REFERENCES emergency_cases(emergency_id),
    ambulance_id VARCHAR(64) NOT NULL REFERENCES ambulances(ambulance_id),
    driver_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
    assigned_hospital_id VARCHAR(64) REFERENCES hospitals(hospital_id),
    current_state VARCHAR(50) NOT NULL DEFAULT 'DISPATCHED',
    pickup_eta_mins DOUBLE PRECISION,
    hospital_eta_mins DOUBLE PRECISION,
    entity_version INT NOT NULL DEFAULT 1,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE roadblocks (
    roadblock_id VARCHAR(64) PRIMARY KEY,
    source VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    scope VARCHAR(50) NOT NULL DEFAULT 'FULL_BLOCK',
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE route_versions (
    route_id VARCHAR(64) PRIMARY KEY,
    mission_id VARCHAR(64) NOT NULL REFERENCES missions(mission_id),
    version_number INT NOT NULL,
    encoded_polyline TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    estimated_duration_mins DOUBLE PRECISION NOT NULL,
    avoided_roadblocks_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hospital_requests (
    request_id VARCHAR(64) PRIMARY KEY,
    emergency_id VARCHAR(64) NOT NULL REFERENCES emergency_cases(emergency_id),
    hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(hospital_id),
    status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED', -- REQUESTED, ACCEPTED, REJECTED, RESERVED, EXPIRED
    required_beds INT NOT NULL DEFAULT 1,
    required_icu BOOLEAN NOT NULL DEFAULT FALSE,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE reservations (
    reservation_id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL REFERENCES hospital_requests(request_id),
    hospital_id VARCHAR(64) NOT NULL REFERENCES hospitals(hospital_id),
    emergency_id VARCHAR(64) NOT NULL REFERENCES emergency_cases(emergency_id),
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED', -- CONFIRMED, FULFILLED, CANCELLED
    beds_reserved INT NOT NULL DEFAULT 1,
    icu_reserved BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tracking_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    emergency_id VARCHAR(64) NOT NULL UNIQUE REFERENCES emergency_cases(emergency_id),
    tracking_token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sms_outbox (
    outbox_id VARCHAR(64) PRIMARY KEY,
    recipient_phone VARCHAR(30) NOT NULL,
    message_text TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE green_corridor_signals (
    junction_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    current_state VARCHAR(30) NOT NULL DEFAULT 'UNAVAILABLE', -- REQUESTED, ACKNOWLEDGED, CLEARING, ACTIVE, PASSED, EXPIRED, UNAVAILABLE
    active_mission_id VARCHAR(64) REFERENCES missions(mission_id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
    event_id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(64),
    actor_role VARCHAR(50),
    aggregate_id VARCHAR(64) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    details TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webhook_idempotency (
    idempotency_key VARCHAR(128) PRIMARY KEY,
    external_ref VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
