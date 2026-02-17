-- =====================================================
-- ARO DISTRIBUTION ENGINE — NEW TABLES
-- Run this migration in Supabase SQL Editor
-- =====================================================

-- Distribution events: tracks every placement + its performance
CREATE TABLE IF NOT EXISTS public.fp_distribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number INTEGER NOT NULL,
  room_id UUID,
  pack_id TEXT,
  channel TEXT NOT NULL,
  surface TEXT,
  placement_url TEXT,
  caption_tone TEXT,
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dist_events_serial ON fp_distribution_events (serial_number);
CREATE INDEX IF NOT EXISTS idx_dist_events_channel ON fp_distribution_events (channel);
CREATE INDEX IF NOT EXISTS idx_dist_events_pack ON fp_distribution_events (pack_id);
CREATE INDEX IF NOT EXISTS idx_dist_events_posted ON fp_distribution_events (posted_at);

-- UTM tracking: stores UTM params from page views for attribution
CREATE TABLE IF NOT EXISTS public.fp_utm_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  footprint_id UUID NOT NULL,
  serial_number INTEGER NOT NULL,
  utm_pack TEXT,
  utm_channel TEXT,
  utm_surface TEXT,
  visitor_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utm_visits_footprint ON fp_utm_visits (footprint_id);
CREATE INDEX IF NOT EXISTS idx_utm_visits_pack ON fp_utm_visits (utm_pack);
CREATE INDEX IF NOT EXISTS idx_utm_visits_created ON fp_utm_visits (created_at);

-- Add remix_source to footprints for tracking remix chains (System 5)
-- ALTER TABLE footprints ADD COLUMN IF NOT EXISTS remix_source TEXT;

-- =====================================================
-- DEPLOYMENT PACKS: pre-configured deployment bundles
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fp_deployment_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  room_name TEXT,
  cluster TEXT,
  captions JSONB DEFAULT '[]'::jsonb,
  targets JSONB DEFAULT '[]'::jsonb,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packs_status ON fp_deployment_packs (status);
CREATE INDEX IF NOT EXISTS idx_packs_created ON fp_deployment_packs (created_at);
