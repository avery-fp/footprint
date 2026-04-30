-- 026_owner_return.sql
--
-- Owner Return V1: username + owner key opens the editor.
-- Raw owner keys never touch storage; checkout stores a server-side hash
-- on the pending reservation, then claim finalization activates it on the
-- claimed footprint.

ALTER TABLE footprints ADD COLUMN IF NOT EXISTS owner_key_hash TEXT;
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS owner_key_set_at TIMESTAMPTZ;
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS owner_key_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS owner_key_locked_until TIMESTAMPTZ;
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS owner_recovery_email TEXT;

ALTER TABLE slug_reservations ADD COLUMN IF NOT EXISTS owner_key_hash TEXT;
ALTER TABLE slug_reservations ADD COLUMN IF NOT EXISTS owner_key_set_at TIMESTAMPTZ;
ALTER TABLE slug_reservations ADD COLUMN IF NOT EXISTS owner_recovery_email TEXT;

CREATE INDEX IF NOT EXISTS idx_footprints_owner_key_locked_until
  ON footprints (owner_key_locked_until)
  WHERE owner_key_locked_until IS NOT NULL;
