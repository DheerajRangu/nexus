-- Schema-only integrity. Demo rows stay out of this migration.

ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS reserved_beds INT NOT NULL DEFAULT 0;

ALTER TABLE hospitals
    DROP CONSTRAINT IF EXISTS hospitals_bed_bounds;

ALTER TABLE hospitals
    ADD CONSTRAINT hospitals_bed_bounds
    CHECK (available_beds >= 0 AND reserved_beds >= 0 AND reserved_beds <= available_beds);

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_assignment_per_ambulance
    ON missions (ambulance_id)
    WHERE current_state NOT IN ('COMPLETED', 'CANCELLED', 'ESCALATED');

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_accepted_offer_per_mission
    ON dispatch_offers (emergency_id)
    WHERE status = 'ACCEPTED';
