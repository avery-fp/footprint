-- =====================================================
-- ARO PUBLISH + PLATFORM STATE TABLES
-- Migration 009: Tables required by /api/aro/publish and operator.js
-- =====================================================

-- ─── aro_surfaces ──────────────────────────────────────
-- Target surfaces where seeds are posted (URLs/platforms)
CREATE TABLE IF NOT EXISTS aro_surfaces (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url        TEXT NOT NULL,
    platform   TEXT,          -- e.g. 'twitter', 'reddit', 'instagram'
    label      TEXT,           -- human-friendly name
    active     BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aro_surfaces_active
    ON aro_surfaces (active) WHERE active = TRUE;

-- ─── aro_seeds ─────────────────────────────────────────
-- Queued messages for operator.js to publish via pinchtab
CREATE TABLE IF NOT EXISTS aro_seeds (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surface_id  UUID REFERENCES aro_surfaces(id) ON DELETE SET NULL,
    copy_text   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed | skipped
    error_msg   TEXT,                            -- last error if failed
    attempts    INTEGER DEFAULT 0,
    sent_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aro_seeds_status_created
    ON aro_seeds (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_aro_seeds_status_sent
    ON aro_seeds (status, sent_at DESC);

-- ─── aro_locks ─────────────────────────────────────────
-- Lightweight advisory locks for publish pacing
CREATE TABLE IF NOT EXISTS aro_locks (
    key        TEXT PRIMARY KEY,
    timestamp  BIGINT NOT NULL
);

-- ─── aro_platform_state ────────────────────────────────
-- Per-platform rate-limit state, referenced by functions in migration 008
CREATE TABLE IF NOT EXISTS aro_platform_state (
    platform            TEXT PRIMARY KEY,
    enabled             BOOLEAN DEFAULT TRUE,
    daily_posts_today   INTEGER DEFAULT 0,
    daily_posts_date    DATE DEFAULT CURRENT_DATE,
    cooldown_until      TIMESTAMPTZ,
    consecutive_errors  INTEGER DEFAULT 0,
    last_post_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default platform rows so aro_can_post() has something to query
INSERT INTO aro_platform_state (platform) VALUES
    ('twitter'),
    ('reddit'),
    ('instagram'),
    ('email'),
    ('tiktok')
ON CONFLICT (platform) DO NOTHING;
