-- =====================================================
-- FOOTPRINT MONETIZATION ENGINE
-- Migration 002: Checkout pipeline, referrals, events
-- =====================================================

-- =====================================================
-- 1. REFERRAL SYSTEM
-- =====================================================

-- Add referred_by to users (stores referral code of referrer)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50);

-- Referrals tracking table
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_serial INTEGER NOT NULL,          -- serial of the user who shared
    referred_user_id UUID REFERENCES users(id),-- the new user who signed up
    referral_code VARCHAR(50) NOT NULL,        -- e.g. FP-7777
    converted BOOLEAN DEFAULT FALSE,           -- did they actually buy?
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_serial);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code);

-- =====================================================
-- 2. PROMO CODES
-- =====================================================

CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_cents INTEGER NOT NULL DEFAULT 1000,  -- $10 = free
    max_uses INTEGER DEFAULT NULL,                  -- null = unlimited
    times_used INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the "please" promo code — $0 forever
INSERT INTO promo_codes (code, discount_cents, max_uses, active)
VALUES ('please', 1000, NULL, TRUE)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 3. ONE-TIME LOGIN TOKENS (for post-checkout auto-login)
-- =====================================================

CREATE TABLE IF NOT EXISTS login_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_tokens_token ON login_tokens (token);

-- Auto-cleanup expired login tokens
CREATE OR REPLACE FUNCTION cleanup_login_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM login_tokens WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. ANALYTICS EVENTS (micro-brain)
-- =====================================================

CREATE TABLE IF NOT EXISTS fp_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    footprint_id UUID REFERENCES footprints(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,  -- visit, tile_click, referral_visit, share, conversion
    event_data JSONB DEFAULT '{}',
    visitor_hash VARCHAR(64),
    referrer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_events_footprint ON fp_events (footprint_id);
CREATE INDEX IF NOT EXISTS idx_fp_events_type ON fp_events (event_type);
CREATE INDEX IF NOT EXISTS idx_fp_events_date ON fp_events (created_at);
CREATE INDEX IF NOT EXISTS idx_fp_events_composite ON fp_events (footprint_id, event_type, created_at);

-- =====================================================
-- 5. REFERRAL COUNT FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_referral_count(p_serial INTEGER)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM referrals
    WHERE referrer_serial = p_serial AND converted = TRUE;
$$ LANGUAGE sql;

-- =====================================================
-- 6. EVENT AGGREGATION FUNCTION (for ARO feed)
-- =====================================================

CREATE OR REPLACE FUNCTION get_event_summary(
    p_footprint_id UUID,
    p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days'
)
RETURNS TABLE(
    event_type VARCHAR,
    event_count BIGINT,
    latest TIMESTAMPTZ
) AS $$
    SELECT
        event_type,
        COUNT(*) as event_count,
        MAX(created_at) as latest
    FROM fp_events
    WHERE footprint_id = p_footprint_id
    AND created_at >= p_since
    GROUP BY event_type
    ORDER BY event_count DESC;
$$ LANGUAGE sql;
