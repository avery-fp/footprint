-- 3-state tile topology: S (1) → M (2) → L (3)
-- Move all previously-enlarged tiles into the new M (Statement) state.
-- M is the natural middle — "prominent but not dominant."
-- Users who want hero emphasis can escalate to L deliberately.
UPDATE content SET size = 2 WHERE size >= 2;
