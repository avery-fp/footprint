-- =====================================================
-- ARO REACTOR: JOBS + IDEMPOTENCY + STATE
-- Migration 011: One-button reactor infrastructure
-- =====================================================

-- ─── aro_jobs ────────────────────────────────────────────
-- Each engine cycle creates one row. Tracks what happened.
CREATE TABLE IF NOT EXISTS aro_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status         TEXT NOT NULL DEFAULT 'running',  -- running | completed | failed
    targets_found  INT DEFAULT 0,
    comments_gen   INT DEFAULT 0,
    seeds_queued   INT DEFAULT 0,
    errors         JSONB DEFAULT '[]'::jsonb,
    started_at     TIMESTAMPTZ DEFAULT NOW(),
    completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aro_jobs_started
    ON aro_jobs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_aro_jobs_status
    ON aro_jobs (status);

-- ─── aro_content_hashes ──────────────────────────────────
-- Prevents the same content from being posted twice to the same surface.
-- hash = sha256(surface_url + comment_text).slice(0, 16)
CREATE TABLE IF NOT EXISTS aro_content_hashes (
    hash       TEXT PRIMARY KEY,
    surface_id UUID REFERENCES aro_surfaces(id) ON DELETE SET NULL,
    seed_id    UUID REFERENCES aro_seeds(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── aro_reactor_state ───────────────────────────────────
-- Single-row table. Controls whether the cron-triggered engine runs.
CREATE TABLE IF NOT EXISTS aro_reactor_state (
    id         TEXT PRIMARY KEY DEFAULT 'singleton',
    active     BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO aro_reactor_state (id, active)
VALUES ('singleton', FALSE)
ON CONFLICT (id) DO NOTHING;
