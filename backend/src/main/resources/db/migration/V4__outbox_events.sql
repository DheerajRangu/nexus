CREATE TABLE outbox_events (
    event_id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    entity_version INTEGER NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unpublished ON outbox_events (published, occurred_at)
    WHERE published = FALSE;
