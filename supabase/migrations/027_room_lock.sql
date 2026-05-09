-- 027_room_lock.sql
--
-- Privacy primitive: rooms can be locked behind a 4-digit passcode.
-- A locked room renders fully blurred for non-owners until the correct
-- passcode unblurs it for the current session. Owners always see locked
-- rooms unblurred.
--
-- Also drops the now-vestigial `hidden` column. The hidden state was an
-- ad-hoc visibility flag that never made it into the public privacy
-- model; is_locked replaces it. Any rooms currently with hidden = true
-- become public on migration — the address has always been public, so
-- the new model is the correct ground state. Owners can re-lock those
-- rooms with a passcode if they want them gated.

ALTER TABLE rooms DROP COLUMN IF EXISTS hidden;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS passcode_hash TEXT;
