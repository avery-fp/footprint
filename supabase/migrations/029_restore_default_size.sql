-- 029_restore_default_size.sql
-- One-time normalization: collapse polluted size = 2 tiles back to S (size = 1).
--
-- WHY
--   Default emission across the upload/tile/aro-mint paths had drifted to
--   size = 2 over time, and migration 028 floored every video-like tile to
--   M as well. Result: most existing tiles are stored at size = 2 even
--   though almost none of them are an editorial pick. The renderer now
--   defaults to S and treats wide aspect as non-promotional, but existing
--   rooms keep rendering the old slideshow until the DB is normalized.
--
-- SCOPE
--   library.size = 2 → 1
--   links.size   = 2 → 1
--   size = 3 (rare anchor punctuation) is intentionally NOT touched.
--   size = 1 is already the resting state.
--
-- WHAT THIS UNDOES
--   - Migration 028 (video size-floor backfill) is reversed for any
--     size = 2 video tile. The renderer no longer floors videos to M, so
--     these tiles correctly settle back at S.
--   - The drifted defaults from upload/register, tiles, and aro/mint
--     routes that wrote size = 2 on insert.
--
-- TRADE-OFF
--   Users who explicitly promoted a tile to M lose that promotion and
--   need to re-promote in the editor. This is the accepted cost: the
--   alternative is leaving every room fossilized in the regressed
--   default state, which the directive treats as worse than asking the
--   small minority of intentional-M users to re-tap.
--
-- ROLLBACK
--   Inverse update by tile-id snapshot only — there is no marker
--   distinguishing pre-existing M tiles from auto-emitted ones. Re-running
--   this migration after it's applied is a no-op (no rows at size = 2).

UPDATE library SET size = 1 WHERE size = 2;

UPDATE links SET size = 1 WHERE size = 2;
