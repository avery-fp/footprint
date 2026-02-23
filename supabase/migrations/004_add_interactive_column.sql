-- =====================================================
-- ADD INTERACTIVE COLUMN TO FOOTPRINTS
-- Migration 004: Missing column referenced by editor toggle
-- =====================================================

ALTER TABLE footprints ADD COLUMN IF NOT EXISTS interactive BOOLEAN DEFAULT TRUE;
