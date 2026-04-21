-- 022_stripe_identity.sql
--
-- Delete auth. Stripe becomes identity.
--
-- - footprints.edit_token: per-footprint credential issued after Stripe payment
-- - footprints.user_id: nullable so anonymous drafts can exist before payment
-- - slug_reservations: race protection between Stripe checkout and webhook
--
-- Run in this order. All statements are idempotent (IF NOT EXISTS / IF EXISTS).

-- Edit token column on footprints.
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS edit_token UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_footprints_edit_token
  ON footprints (edit_token) WHERE edit_token IS NOT NULL;

-- Allow anonymous drafts (user_id filled in at payment).
ALTER TABLE footprints ALTER COLUMN user_id DROP NOT NULL;

-- Slug reservations held during Stripe checkout.
CREATE TABLE IF NOT EXISTS slug_reservations (
  slug TEXT PRIMARY KEY,
  stripe_session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slug_reservations_expires
  ON slug_reservations (expires_at);

-- Recovery rate limit: one row per email per hour window.
CREATE TABLE IF NOT EXISTS recovery_attempts (
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_email_time
  ON recovery_attempts (email, attempted_at DESC);
