-- Auth providers table: tracks which OAuth providers a user has linked
-- Enables account linking (same email, different providers)
CREATE TABLE IF NOT EXISTS auth_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,              -- 'apple', 'google', 'email'
  provider_user_id TEXT,               -- Supabase Auth user ID for this provider
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_auth_providers_user_id ON auth_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_providers_email ON auth_providers(email);

-- Passkey credentials table: stores WebAuthn credentials for passkey auth
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,  -- base64url credential ID from WebAuthn
  public_key TEXT NOT NULL,            -- base64-encoded public key
  counter BIGINT NOT NULL DEFAULT 0,   -- signature counter for replay protection
  device_type TEXT,                    -- 'singleDevice' or 'multiDevice'
  backed_up BOOLEAN DEFAULT false,     -- whether credential is synced/backed up
  name TEXT DEFAULT 'Passkey',         -- user-friendly name
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_credential_id ON passkey_credentials(credential_id);

-- Allow password_hash to be NULL for OAuth-only users
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
