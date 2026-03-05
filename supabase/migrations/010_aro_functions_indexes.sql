-- =====================================================
-- ARO FUNCTIONS + PERFORMANCE INDEXES
-- Migration 010: Atomic helpers and query optimization
-- =====================================================

-- ─── Atomic click increment ────────────────────────────
-- Used by /api/aro/track to avoid read-then-write race condition
CREATE OR REPLACE FUNCTION aro_increment_clicks(
    p_pack_id TEXT,
    p_channel TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE fp_distribution_events
    SET clicks = clicks + 1
    WHERE id = (
        SELECT id FROM fp_distribution_events
        WHERE pack_id = p_pack_id
          AND channel = p_channel
        ORDER BY posted_at DESC
        LIMIT 1
    );
END;
$$;

-- ─── Atomic conversion increment ──────────────────────
CREATE OR REPLACE FUNCTION aro_increment_conversions(
    p_pack_id TEXT,
    p_channel TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE fp_distribution_events
    SET conversions = conversions + 1
    WHERE id = (
        SELECT id FROM fp_distribution_events
        WHERE pack_id = p_pack_id
          AND channel = p_channel
        ORDER BY posted_at DESC
        LIMIT 1
    );
END;
$$;

-- ─── Performance indexes ──────────────────────────────

-- Hot path: public page load (published + username)
CREATE INDEX IF NOT EXISTS idx_footprints_published_username
    ON footprints (published, username)
    WHERE published = TRUE;

-- Hot path: events feed time-range scan
CREATE INDEX IF NOT EXISTS idx_fp_events_created_type
    ON fp_events (created_at, event_type);

-- Hot path: UTM visit lookups
CREATE INDEX IF NOT EXISTS idx_fp_utm_visits_pack_channel
    ON fp_utm_visits (utm_pack, utm_channel);

-- Hot path: distribution event click attribution
CREATE INDEX IF NOT EXISTS idx_fp_dist_events_pack_channel_posted
    ON fp_distribution_events (pack_id, channel, posted_at DESC);

-- Hot path: seed queue (what operator.js polls)
CREATE INDEX IF NOT EXISTS idx_aro_seeds_queued
    ON aro_seeds (status, created_at ASC)
    WHERE status = 'queued';

-- Hot path: rooms by serial + position
CREATE INDEX IF NOT EXISTS idx_rooms_serial_pos
    ON rooms (serial_number, position);

-- Analytics: referrer aggregation
CREATE INDEX IF NOT EXISTS idx_page_views_footprint_referrer
    ON page_views (footprint_id, referrer)
    WHERE referrer IS NOT NULL;

-- Sitemap: published footprints by update time
CREATE INDEX IF NOT EXISTS idx_footprints_published_updated
    ON footprints (published, updated_at DESC)
    WHERE published = TRUE;
