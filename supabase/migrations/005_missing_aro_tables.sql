-- =====================================================
-- MISSING ARO TABLES
-- Migration 005: Tables referenced in code but not yet defined
-- =====================================================

-- =====================================================
-- 1. fp_deployment_packs — ARO deployment pack tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS fp_deployment_packs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pack_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    room_name VARCHAR(255),
    cluster VARCHAR(100),
    captions JSONB DEFAULT '[]',
    targets JSONB DEFAULT '[]',
    score FLOAT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_deployment_packs_slug ON fp_deployment_packs (slug);
CREATE INDEX IF NOT EXISTS idx_fp_deployment_packs_status ON fp_deployment_packs (status);

-- =====================================================
-- 2. fp_distribution_events — ARO distribution event tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS fp_distribution_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number INTEGER REFERENCES serials(number),
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    pack_id VARCHAR(100),
    channel VARCHAR(100) NOT NULL,
    surface VARCHAR(100),
    placement_url TEXT,
    caption_tone VARCHAR(100),
    notes TEXT,
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    posted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_dist_events_serial ON fp_distribution_events (serial_number);
CREATE INDEX IF NOT EXISTS idx_fp_dist_events_pack ON fp_distribution_events (pack_id);
CREATE INDEX IF NOT EXISTS idx_fp_dist_events_channel ON fp_distribution_events (channel);
CREATE INDEX IF NOT EXISTS idx_fp_dist_events_posted ON fp_distribution_events (posted_at);

-- =====================================================
-- 3. fp_utm_visits — ARO UTM visit tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS fp_utm_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    footprint_id UUID REFERENCES footprints(id) ON DELETE CASCADE,
    serial_number INTEGER REFERENCES serials(number),
    utm_pack VARCHAR(100),
    utm_channel VARCHAR(100),
    utm_surface VARCHAR(100),
    visitor_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_utm_visits_footprint ON fp_utm_visits (footprint_id);
CREATE INDEX IF NOT EXISTS idx_fp_utm_visits_pack ON fp_utm_visits (utm_pack);
CREATE INDEX IF NOT EXISTS idx_fp_utm_visits_created ON fp_utm_visits (created_at);
