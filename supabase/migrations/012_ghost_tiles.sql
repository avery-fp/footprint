-- Ghost Tiles: add render_mode and metadata columns to links table
-- render_mode: 'embed' (default, existing behavior) or 'ghost' (new ghost tile render)

ALTER TABLE links ADD COLUMN IF NOT EXISTS render_mode TEXT DEFAULT 'embed';
ALTER TABLE links ADD COLUMN IF NOT EXISTS artist TEXT;
ALTER TABLE links ADD COLUMN IF NOT EXISTS thumbnail_url_hq TEXT;
ALTER TABLE links ADD COLUMN IF NOT EXISTS media_id TEXT;
