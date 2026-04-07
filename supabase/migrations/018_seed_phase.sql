-- Silent pre-monetization phase: first 500 publishes are free.
-- After publish #500 (post-seed), the same flow routes to the paid Stripe path.
--
-- Production-aware: production has no `serials` table or `payments` table.
-- Serials are allocated via MAX(serial_number)+1. Audit goes to `purchases`.
-- The threshold is count-based (number of published footprints) and accounts
-- for the 24 publishes that already exist before the seed phase opens:
-- threshold = 24 + 500 = 524 absolute count.

-- 1. Audit marker for seed-phase publishes
ALTER TABLE footprints
  ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;

-- 2. published_at column (referenced by publish API but missing in production)
ALTER TABLE footprints
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 3. Read-only peek: are we still in the seed phase?
-- Used by /api/publish/phase to hide the $10 in the UI, and by /api/publish
-- to decide whether the next claim is seed (free, instant) or paid (Stripe).
-- Default threshold = 524 = the 24 publishes that existed when this migration
-- ran + 500 seed publishes. After publish #524, function returns false and
-- the system silently routes to the paid flow with no UI change.
CREATE OR REPLACE FUNCTION peek_next_serial_seed(p_threshold INTEGER DEFAULT 524)
RETURNS BOOLEAN AS $$
DECLARE
  pub_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO pub_count FROM footprints WHERE published = TRUE;
  RETURN pub_count < p_threshold;
END;
$$ LANGUAGE plpgsql STABLE;
