# Database

Reuse existing DATABASE_URL: SQLite for local demo or PostgreSQL through psycopg. `backend/database.py` loads root .env without replacing exported variables. Startup `initialize()` adds new tables through SQLAlchemy create_all; existing video rows are retained. There is no destructive migration or new database technology.

| Table | Added fields / purpose |
|---|---|
| videos (existing) | Existing video info, configuration and state; unchanged |
| emergency_city | Singleton id, revision, JSON aggregate |
| emergency_outbox | Unique event id, revision, indexed incident_id/event_type, event JSON |
| emergency_access | SHA-256 token_hash primary key, kind, incident_id, role, resource_id, expiry |

The aggregate contains incidents/patients, ambulances/drivers, assignments, hospitals/reservations, routes, road events/cameras, corridors/signals and timelines. Foreign references are validated in the service; these entities are not claimed as separate normalized relational tables. Transactions use a row lock and revision compare-and-swap retry to avoid double dispatch. City update and outbox inserts commit together. Token plaintext is returned only when issued; only hashes are persisted.

Back up the database and video evidence directories together. Local tests create a separate temporary SQLite database and never alter aegis.db. Browser integration uses `videos/outputs/integration-demo.db`, not the user's operational database. An existing Spring database is not automatically imported; its source/migrations are retained under backend/src and documented branch references.

Production growth should use explicit versioned schema migrations, retention/pagination for aggregate/outbox history and normalized operational entities if needed; this demo uses additive startup creation only. The complete 47-test suite also passes against an isolated PostgreSQL 15 UTF-8 database. Docker deployment itself has not been run.
