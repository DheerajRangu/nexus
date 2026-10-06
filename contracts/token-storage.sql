-- Token storage for the AEGIS Spring Boot service.
-- Apply this to the shared AEGIS PostgreSQL database.
-- It does not create missions, ambulances, hospitals, or a second dispatch store.
-- emergency_id refers to the emergency already owned by Spring Boot.
-- Store only a SHA-256 hex digest of the tracking token. Never store the raw token.

create table if not exists citizen_tracking_token (
  token_hash char(64) primary key,
  emergency_id text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists citizen_tracking_token_emergency_idx
  on citizen_tracking_token (emergency_id);

-- Short-lived browser sessions issued in exchange for a link token.
-- secret_hash is the SHA-256 hex digest of the cookie value.

create table if not exists citizen_tracking_session (
  secret_hash char(64) primary key,
  emergency_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists citizen_tracking_session_emergency_idx
  on citizen_tracking_session (emergency_id);
