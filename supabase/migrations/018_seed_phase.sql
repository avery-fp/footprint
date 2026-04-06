-- Silent pre-monetization phase: first 500 publishes are free.
-- After publish #500, the same flow routes to the paid Stripe path.

-- Audit marker for seed-phase publishes
ALTER TABLE footprints
  ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;

-- Expand the serial pool from 10k to 100k so the paid phase has runway
INSERT INTO serials (number)
SELECT generate_series(17777, 107776)
ON CONFLICT (number) DO NOTHING;

-- Read-only peek: is the NEXT unassigned serial in the seed range?
-- Used by the publish endpoint and the UI phase check.
-- Threshold defaults to 500 — overridable per call.
CREATE OR REPLACE FUNCTION peek_next_serial_seed(p_threshold INTEGER DEFAULT 500)
RETURNS BOOLEAN AS $$
DECLARE
  peeked INTEGER;
BEGIN
  SELECT number INTO peeked
  FROM serials
  WHERE is_assigned = FALSE
  ORDER BY number
  LIMIT 1;

  IF peeked IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Serial 7777 is the 1st publish → seed if (peeked - 7776) <= threshold
  RETURN (peeked - 7776) <= p_threshold;
END;
$$ LANGUAGE plpgsql STABLE;
