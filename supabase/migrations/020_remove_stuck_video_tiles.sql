-- 020_remove_stuck_video_tiles.sql
-- Remove library rows created by the Mux upload lane that never completed.
-- These have media_kind='video' and status='uploading' or 'processing',
-- with an empty image_url — they display as permanent dark placeholders.
-- Direct video upload is removed; embeds (YouTube, Instagram, X) are unaffected.

DELETE FROM library WHERE media_kind = 'video';
