-- =====================================================
-- ASPECT RATIO COLUMN
-- Migration 003: Add aspect column to library and links
-- NULL = use smart content-type default (e.g. 16:9 for
-- YouTube, natural ratio for images, square for music)
-- =====================================================

ALTER TABLE library ADD COLUMN IF NOT EXISTS aspect VARCHAR(10);
ALTER TABLE links ADD COLUMN IF NOT EXISTS aspect VARCHAR(10);
