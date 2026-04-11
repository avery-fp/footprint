-- 019_video_provider.sql
-- Processed video lane: route uploaded phone videos to Mux/Cloudflare Stream
-- Images stay on Supabase Storage, embeds stay in links table

ALTER TABLE library ADD COLUMN IF NOT EXISTS media_kind VARCHAR(10);
ALTER TABLE library ADD COLUMN IF NOT EXISTS provider VARCHAR(20);
ALTER TABLE library ADD COLUMN IF NOT EXISTS playback_url TEXT;
ALTER TABLE library ADD COLUMN IF NOT EXISTS poster_url TEXT;
ALTER TABLE library ADD COLUMN IF NOT EXISTS asset_id VARCHAR(255);
ALTER TABLE library ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE library ADD COLUMN IF NOT EXISTS status VARCHAR(20);

-- Webhook lookups: provider returns asset_id, we find the row
CREATE INDEX IF NOT EXISTS idx_library_asset_id ON library (asset_id) WHERE asset_id IS NOT NULL;
