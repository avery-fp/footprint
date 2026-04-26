-- 023_draft_friendly_footprints.sql
--
-- NO-OP. Superseded by the application-level change in app/api/draft/create:
-- drafts now claim a real serial_number at creation via claim_next_serial()
-- because footprints.serial_number is the PRIMARY KEY (five tables FK to it)
-- and cannot be made nullable.
--
-- The earlier version of this migration attempted
--   ALTER TABLE footprints ALTER COLUMN serial_number DROP NOT NULL;
-- which fails on PRIMARY KEY columns. If you ran it and it errored, that
-- error was harmless — no rows or columns were modified.
--
-- Intentionally empty. Safe to run or skip.

SELECT 1;
