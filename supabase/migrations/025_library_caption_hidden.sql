-- 025_library_caption_hidden.sql
--
-- Adds caption, title, and caption_hidden to library for captioned image tiles.
-- caption/title were in schema.sql but never migrated to prod; IF NOT EXISTS is safe.
-- caption_hidden default FALSE = show caption (preserves all existing image tiles).
ALTER TABLE library ADD COLUMN IF NOT EXISTS title VARCHAR(500);
ALTER TABLE library ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE library ADD COLUMN IF NOT EXISTS caption_hidden BOOLEAN DEFAULT FALSE;
