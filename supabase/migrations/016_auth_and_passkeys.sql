-- =====================================================
-- 016: AUTH REFACTOR — OAuth Providers + Passkeys + Magic Links
--
-- Adds:
--   1. auth_provider column on users (how they signed up)
--   2. passkey_credentials table (WebAuthn / FIDO2)
--   3. Indexes for fast passkey lookup
--   4. oauth_provider on users for tracking source
--
-- Safe to run multiple times (IF NOT EXISTS / ADD IF NOT EXISTS).
-- =====================================================

-- Track how the user originally authenticated
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'password';
-- 'password' | 'google' | 'apple' | 'magic_link' | 'passkey'

-- Track OAuth provider ID for linking
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider_id TEXT;

-- Display name from OAuth (Google name, Apple name, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Avatar URL from OAuth provider
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- =====================================================
-- PASSKEY CREDENTIALS (WebAuthn / FIDO2)
-- Each user can register multiple passkeys (phone, laptop, YubiKey).
-- =====================================================
CREATE TABLE IF NOT EXISTS passkey_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- WebAuthn credential fields (stored as base64url strings)
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,

    -- Device transport hints (usb, ble, nfc, internal)
    transports TEXT[] DEFAULT '{}',

    -- Human label ("MacBook Pro", "iPhone 15", "YubiKey")
    device_name VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey_credentials (user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_credential ON passkey_credentials (credential_id);

-- =====================================================
-- WEBAUTHN CHALLENGES (ephemeral, auto-cleaned)
-- Stores registration/authentication challenges with short TTL.
-- =====================================================
CREATE TABLE IF NOT EXISTS webauthn_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'registration' | 'authentication'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenge ON webauthn_challenges (challenge);

-- Auto-cleanup expired challenges (reuse pattern from magic_links)
CREATE OR REPLACE FUNCTION cleanup_webauthn_challenges()
RETURNS void AS $$
BEGIN
    DELETE FROM webauthn_challenges WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MAGIC LINKS — ensure the table exists (may have been created in schema.sql)
-- Add rate limiting column
-- =====================================================
ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
