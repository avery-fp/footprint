-- 024_edit_access_codes.sql
--
-- Same-page email-code login for the editor.
--
-- Owner visits /{slug}/home, enters their owner email, server emails a
-- 6-digit code. Owner enters the code on the same page; server sets the
-- fp_edit_{slug} cookie. No magic links to chase across inboxes.
--
-- Rows are short-lived (10 min expiry, 5 attempt cap) and consumed on
-- successful verify.

CREATE TABLE IF NOT EXISTS edit_access_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edit_access_codes_lookup
  ON edit_access_codes (slug, email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edit_access_codes_expires
  ON edit_access_codes (expires_at);

-- Lock the table down. Code hashes plus (slug, email) pairs are
-- mid-flight authentication state — anon/authenticated roles must not
-- see them or write them. The service role bypasses RLS, so the
-- /api/edit-access/* routes (which use SUPABASE_SERVICE_ROLE_KEY) keep
-- full access. No policies are defined: with RLS enabled and zero
-- policies, all non-service-role access is denied. Idempotent on
-- re-run; no-op if already enabled.
ALTER TABLE edit_access_codes ENABLE ROW LEVEL SECURITY;
