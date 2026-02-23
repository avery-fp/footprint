-- =====================================================
-- ATOMIC PROMO CODE INCREMENT
-- Migration 003: Prevent race condition on promo usage
-- =====================================================

-- Atomically increment times_used, respecting max_uses.
-- Returns the new times_used value, or -1 if the code is exhausted.
CREATE OR REPLACE FUNCTION increment_promo_usage(promo_id UUID)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE promo_codes
    SET times_used = times_used + 1
    WHERE id = promo_id
      AND active = TRUE
      AND (max_uses IS NULL OR times_used < max_uses)
    RETURNING times_used INTO new_count;

    IF new_count IS NULL THEN
        RETURN -1;
    END IF;

    RETURN new_count;
END;
$$ LANGUAGE plpgsql;
