-- 3-state tile topology: S (1) → M (2) → L (3)
-- Move all previously-enlarged tiles into the new M (Statement) state.
-- M is the natural middle — "prominent but not dominant."
-- Users who want hero emphasis can escalate to L deliberately.
--
-- Tile data lives in `library` (uploads) and `links` (URL tiles).
-- Already applied to prod 2026-04-14: 25 library + 43 links = 68 rows.
UPDATE library SET size = 2 WHERE size >= 2;
UPDATE links SET size = 2 WHERE size >= 2;
