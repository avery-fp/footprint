-- Container tiles: tiles that hold child tiles (depth navigation)
-- parent_tile_id links a child tile to its container (NULL = street level)
-- container_label + container_cover_url are only used when platform = 'container'

-- Add parent_tile_id to both tile tables
ALTER TABLE links ADD COLUMN IF NOT EXISTS parent_tile_id UUID DEFAULT NULL;
ALTER TABLE library ADD COLUMN IF NOT EXISTS parent_tile_id UUID DEFAULT NULL;

-- Container metadata (only meaningful on links rows where platform = 'container')
ALTER TABLE links ADD COLUMN IF NOT EXISTS container_label VARCHAR(100) DEFAULT NULL;
ALTER TABLE links ADD COLUMN IF NOT EXISTS container_cover_url TEXT DEFAULT NULL;

-- Index for fast child tile lookups
CREATE INDEX IF NOT EXISTS idx_links_parent ON links (parent_tile_id) WHERE parent_tile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_library_parent ON library (parent_tile_id) WHERE parent_tile_id IS NOT NULL;

-- Index for street-level filtering (parent IS NULL)
CREATE INDEX IF NOT EXISTS idx_links_street ON links (serial_number, position) WHERE parent_tile_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_library_street ON library (serial_number, position) WHERE parent_tile_id IS NULL;
