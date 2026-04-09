ALTER TABLE footprints
ADD COLUMN IF NOT EXISTS display_title TEXT;

CREATE TABLE IF NOT EXISTS footprint_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    footprint_id UUID NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_footprint_states_footprint
    ON footprint_states (footprint_id);

CREATE INDEX IF NOT EXISTS idx_footprint_states_footprint_updated
    ON footprint_states (footprint_id, updated_at DESC);

ALTER TABLE footprint_states ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'footprint_states'
          AND policyname = 'footprint_states_owner'
    ) THEN
        CREATE POLICY footprint_states_owner ON footprint_states
            FOR ALL
            USING (
                footprint_id IN (
                    SELECT id FROM footprints WHERE user_id = auth.uid()
                )
            )
            WITH CHECK (
                footprint_id IN (
                    SELECT id FROM footprints WHERE user_id = auth.uid()
                )
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS footprint_states_updated_at ON footprint_states;

CREATE TRIGGER footprint_states_updated_at
    BEFORE UPDATE ON footprint_states
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
