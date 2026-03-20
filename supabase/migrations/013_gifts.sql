-- =====================================================
-- GIFT A FOOTPRINT
-- Migration 013: gifts table + gifts_remaining on users
-- =====================================================

-- Add gifts_remaining to users (default 2 after $10 claim)
ALTER TABLE users ADD COLUMN IF NOT EXISTS gifts_remaining INTEGER DEFAULT 0;

-- Update existing paid users (those with serial_number) to have 2 gifts
UPDATE users SET gifts_remaining = 2 WHERE serial_number IS NOT NULL AND gifts_remaining = 0;

-- Gifts tracking table
CREATE TABLE IF NOT EXISTS gifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id),
    recipient_email VARCHAR(255) NOT NULL,
    claim_token VARCHAR(64) UNIQUE NOT NULL,
    claimed BOOLEAN DEFAULT FALSE,
    claimed_by UUID REFERENCES users(id),
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gifts_sender ON gifts (sender_id);
CREATE INDEX IF NOT EXISTS idx_gifts_token ON gifts (claim_token);
CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON gifts (recipient_email);
