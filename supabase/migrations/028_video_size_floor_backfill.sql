-- 028_video_size_floor_backfill.sql
-- One-time dev-data backfill: floor video-like tile sizes to M (size = 2).
--
-- WHY
--   PR #388 ("Floor video tiles to M") established the product law that
--   video tiles render at minimum M. The renderer enforces this at
--   display time (lib/media/aspect.ts:getGridClass), but existing
--   prototype rows still have size = 1 (or NULL) in storage. Pre-launch,
--   we have no real-user data — it's safe to align the database with
--   the new law in one pass.
--
-- SCOPE
--   library: rows whose media_kind = 'video' OR whose image_url has a
--            video file extension. Mirrors mediaTypeFromUrl() in
--            lib/media.ts, the single source of truth for image-vs-video
--            on uploaded media. Extension list pinned to VIDEO_EXT
--            (lib/media.ts:11).
--   links:   rows whose platform ∈ {'youtube', 'vimeo'}. Matches the
--            isVideoTile() predicate in lib/media/aspect.ts.
--   TikTok is intentionally NOT included — isVideoTile() excludes it,
--   so the renderer doesn't treat TikTok as video for size purposes.
--   Matching the law means matching its scope.
--   Image / link / music / text / thought / container tiles are
--   untouched.
--
-- ONLY ROWS WITH size IS NULL OR size < 2 ARE TOUCHED
--   Rows already at M or L are left alone. Re-running this migration
--   after it's applied is a no-op.
--
-- ROLLBACK
--   This is a one-way floor: original sub-M sizes (1 / NULL) are not
--   preserved. The inverse update would be:
--     UPDATE library SET size = 1 WHERE size = 2 AND ...same predicate...;
--     UPDATE links   SET size = 1 WHERE size = 2 AND ...same predicate...;
--   But the renderer's video M-floor would still upgrade those back to
--   M at display time, so the inverse is observably a no-op in the UI.
--   In practice: do not roll back. Revert PR #388 first if the M-floor
--   itself needs to be undone.

UPDATE library
SET size = 2
WHERE (size IS NULL OR size < 2)
  AND (
    media_kind = 'video'
    OR image_url ~* '\.(mp4|mov|webm|m4v|3gp|3gpp|mkv)($|\?)'
  );

UPDATE links
SET size = 2
WHERE (size IS NULL OR size < 2)
  AND platform IN ('youtube', 'vimeo');
