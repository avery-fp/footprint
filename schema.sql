-- =====================================================
-- FOOTPRINT NANO - DATABASE SCHEMA
-- Supabase / PostgreSQL
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SERIAL NUMBERS
-- The core scarcity mechanism. Numbers never repeat.
-- =====================================================
CREATE TABLE serials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number INTEGER UNIQUE NOT NULL,
    is_assigned BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial serials starting at 7777
-- This creates the "manufactured history" - implies 7776 people already have one
INSERT INTO serials (number)
SELECT generate_series(7777, 17776);  -- First 10k serials

-- Index for fast lookup of next available
CREATE INDEX idx_serials_unassigned ON serials (number) WHERE is_assigned = FALSE;

-- Function to claim next serial atomically
CREATE OR REPLACE FUNCTION claim_next_serial()
RETURNS INTEGER AS $$
DECLARE
    next_serial INTEGER;
BEGIN
    -- Lock and claim the next available serial
    UPDATE serials
    SET is_assigned = TRUE, assigned_at = NOW()
    WHERE number = (
        SELECT number FROM serials
        WHERE is_assigned = FALSE
        ORDER BY number
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING number INTO next_serial;

    RETURN next_serial;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- USERS
-- Email + magic link auth, optional password
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    serial_number INTEGER UNIQUE REFERENCES serials(number),
    stripe_customer_id VARCHAR(255),
    password_hash TEXT,
    referred_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_serial ON users (serial_number);


-- =====================================================
-- FOOTPRINTS
-- Each user can have multiple footprints/pages
-- =====================================================
CREATE TABLE footprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    serial_number INTEGER UNIQUE REFERENCES serials(number),
    username VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    icon VARCHAR(10) DEFAULT '◈',
    is_primary BOOLEAN DEFAULT FALSE,
    published BOOLEAN DEFAULT TRUE,

    -- Profile data
    display_name VARCHAR(255),
    handle VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,

    -- Customization
    dimension VARCHAR(50) DEFAULT 'midnight',
    grid_mode VARCHAR(50) DEFAULT 'edit',
    background_url TEXT,
    background_blur BOOLEAN DEFAULT TRUE,
    weather_effect VARCHAR(50),

    -- Metadata
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(username)
);

CREATE INDEX idx_footprints_user ON footprints (user_id);
CREATE INDEX idx_footprints_username ON footprints (username);
CREATE INDEX idx_footprints_serial ON footprints (serial_number);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER footprints_updated_at
    BEFORE UPDATE ON footprints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- =====================================================
-- ROOMS
-- Sections within a footprint
-- =====================================================
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number INTEGER NOT NULL REFERENCES serials(number),
    name VARCHAR(255) NOT NULL,
    position INTEGER DEFAULT 0,
    hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rooms_serial ON rooms (serial_number);


-- =====================================================
-- LIBRARY (images)
-- Image tiles stored separately from link embeds
-- =====================================================
CREATE TABLE library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number INTEGER NOT NULL REFERENCES serials(number),
    image_url TEXT NOT NULL,
    title VARCHAR(500),
    caption TEXT,
    position INTEGER DEFAULT 0,
    size INTEGER DEFAULT 1,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_library_serial ON library (serial_number);
CREATE INDEX idx_library_room ON library (room_id);


-- =====================================================
-- LINKS (embeds, urls, thoughts)
-- Non-image content tiles
-- =====================================================
CREATE TABLE links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number INTEGER NOT NULL REFERENCES serials(number),
    url TEXT NOT NULL,
    platform VARCHAR(50),
    title VARCHAR(500),
    thumbnail TEXT,
    embed_url TEXT,
    metadata JSONB DEFAULT '{}',
    position INTEGER DEFAULT 0,
    size INTEGER DEFAULT 1,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_links_serial ON links (serial_number);
CREATE INDEX idx_links_room ON links (room_id);


-- =====================================================
-- MAGIC LINKS (for passwordless auth)
-- =====================================================
CREATE TABLE magic_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_magic_links_token ON magic_links (token);
CREATE INDEX idx_magic_links_email ON magic_links (email);

-- Auto-cleanup expired magic links
CREATE OR REPLACE FUNCTION cleanup_magic_links()
RETURNS void AS $$
BEGIN
    DELETE FROM magic_links WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- PAYMENTS
-- Track Stripe payments
-- =====================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    stripe_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent VARCHAR(255),
    amount INTEGER NOT NULL,  -- in cents
    currency VARCHAR(3) DEFAULT 'usd',
    status VARCHAR(50) DEFAULT 'pending',  -- pending, completed, failed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_user ON payments (user_id);
CREATE INDEX idx_payments_session ON payments (stripe_session_id);


-- =====================================================
-- ANALYTICS (simple view tracking)
-- =====================================================
CREATE TABLE page_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    footprint_id UUID NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
    viewer_hash VARCHAR(64),  -- hashed IP for unique counting
    referrer TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_page_views_footprint ON page_views (footprint_id);
CREATE INDEX idx_page_views_date ON page_views (created_at);


-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE footprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE library ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own data
CREATE POLICY users_own_data ON users
    FOR ALL USING (auth.uid() = id);

-- Footprints: owners can do anything, published ones are viewable
CREATE POLICY footprints_owner ON footprints
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY footprints_public_read ON footprints
    FOR SELECT USING (published = TRUE);

-- Library/Links/Rooms: access via serial_number ownership
CREATE POLICY library_owner ON library
    FOR ALL USING (
        serial_number IN (SELECT serial_number FROM users WHERE id = auth.uid())
    );

CREATE POLICY library_public_read ON library
    FOR SELECT USING (
        serial_number IN (SELECT serial_number FROM footprints WHERE published = TRUE)
    );

CREATE POLICY links_owner ON links
    FOR ALL USING (
        serial_number IN (SELECT serial_number FROM users WHERE id = auth.uid())
    );

CREATE POLICY links_public_read ON links
    FOR SELECT USING (
        serial_number IN (SELECT serial_number FROM footprints WHERE published = TRUE)
    );

CREATE POLICY rooms_owner ON rooms
    FOR ALL USING (
        serial_number IN (SELECT serial_number FROM users WHERE id = auth.uid())
    );

CREATE POLICY rooms_public_read ON rooms
    FOR SELECT USING (
        serial_number IN (SELECT serial_number FROM footprints WHERE published = TRUE)
    );


-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get current serial count (for display)
CREATE OR REPLACE FUNCTION get_next_serial_number()
RETURNS INTEGER AS $$
    SELECT number FROM serials
    WHERE is_assigned = FALSE
    ORDER BY number
    LIMIT 1;
$$ LANGUAGE sql;

-- Get total footprints for a user
CREATE OR REPLACE FUNCTION get_user_footprint_count(p_user_id UUID)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM footprints WHERE user_id = p_user_id;
$$ LANGUAGE sql;

-- Increment view count
CREATE OR REPLACE FUNCTION increment_view_count(p_footprint_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE footprints SET view_count = view_count + 1 WHERE id = p_footprint_id;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- MIGRATION (run on existing databases)
-- Adds missing tables/columns. Safe to run multiple times.
-- =====================================================

-- Add missing columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255);

-- Add missing columns to footprints
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS serial_number INTEGER UNIQUE REFERENCES serials(number);
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS background_url TEXT;
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS background_blur BOOLEAN DEFAULT TRUE;
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS weather_effect VARCHAR(50);
ALTER TABLE footprints ADD COLUMN IF NOT EXISTS grid_mode VARCHAR(50) DEFAULT 'edit';

-- Rename slug → username if needed (skip if username already exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'footprints' AND column_name = 'slug')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'footprints' AND column_name = 'username') THEN
        ALTER TABLE footprints RENAME COLUMN slug TO username;
    END IF;
END $$;

-- Rename theme → dimension if needed
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'footprints' AND column_name = 'theme')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'footprints' AND column_name = 'dimension') THEN
        ALTER TABLE footprints RENAME COLUMN theme TO dimension;
    END IF;
END $$;

-- Rename is_public → published if needed
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'footprints' AND column_name = 'is_public')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'footprints' AND column_name = 'published') THEN
        ALTER TABLE footprints RENAME COLUMN is_public TO published;
    END IF;
END $$;

-- Create rooms table if not exists
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number INTEGER NOT NULL REFERENCES serials(number),
    name VARCHAR(255) NOT NULL,
    position INTEGER DEFAULT 0,
    hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create library table if not exists
CREATE TABLE IF NOT EXISTS library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number INTEGER NOT NULL REFERENCES serials(number),
    image_url TEXT NOT NULL,
    title VARCHAR(500),
    caption TEXT,
    position INTEGER DEFAULT 0,
    size INTEGER DEFAULT 1,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create links table if not exists
CREATE TABLE IF NOT EXISTS links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    serial_number INTEGER NOT NULL REFERENCES serials(number),
    url TEXT NOT NULL,
    platform VARCHAR(50),
    title VARCHAR(500),
    thumbnail TEXT,
    embed_url TEXT,
    metadata JSONB DEFAULT '{}',
    position INTEGER DEFAULT 0,
    size INTEGER DEFAULT 1,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =====================================================
-- MONETIZATION TABLES (002_monetization)
-- =====================================================

-- Referrals
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_serial INTEGER NOT NULL,
    referred_user_id UUID REFERENCES users(id),
    referral_code VARCHAR(50) NOT NULL,
    converted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_serial);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code);

-- Promo codes
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_cents INTEGER NOT NULL DEFAULT 1000,
    max_uses INTEGER DEFAULT NULL,
    times_used INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO promo_codes (code, discount_cents, max_uses, active)
VALUES ('please', 1000, NULL, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Login tokens (post-checkout auto-login)
CREATE TABLE IF NOT EXISTS login_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_tokens_token ON login_tokens (token);

-- Analytics events (micro-brain for ARO)
CREATE TABLE IF NOT EXISTS fp_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    footprint_id UUID REFERENCES footprints(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    visitor_hash VARCHAR(64),
    referrer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_events_footprint ON fp_events (footprint_id);
CREATE INDEX IF NOT EXISTS idx_fp_events_type ON fp_events (event_type);
CREATE INDEX IF NOT EXISTS idx_fp_events_date ON fp_events (created_at);
CREATE INDEX IF NOT EXISTS idx_fp_events_composite ON fp_events (footprint_id, event_type, created_at);

-- =====================================================
-- INITIAL SETUP COMPLETE
--
-- Next serial available: 7777
-- Implied existing users: 7776 (manufactured scarcity)
-- =====================================================
