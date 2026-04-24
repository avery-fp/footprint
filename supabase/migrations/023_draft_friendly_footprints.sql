-- 023_draft_friendly_footprints.sql
--
-- Ensures the footprints table accepts anonymous draft rows. This migration
-- backstops 022 — without it, prod rejects `/api/draft/create` because
-- serial_number is still NOT NULL (an earlier "onboarding_rebuild" ALTER
-- lived only in schema.sql and was never promoted to a migration file).
--
-- All statements idempotent. Safe to rerun.

-- Drafts have no serial until claim-time.
ALTER TABLE footprints ALTER COLUMN serial_number DROP NOT NULL;

-- Mirror the drop on users in case prod drifted there too.
ALTER TABLE users ALTER COLUMN serial_number DROP NOT NULL;

-- New rows default to unpublished — drafts are draft until Stripe promotes them.
ALTER TABLE footprints ALTER COLUMN published SET DEFAULT FALSE;
