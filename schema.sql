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
-- Simple auth - email + magic link. No passwords.
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    serial_number INTEGER UNIQUE REFERENCES serials(number),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_serial ON users (serial_number);


-- =====================================================
-- FOOTPRINTS (Rooms)
-- Each user can have unlimited footprints/rooms
-- =====================================================
CREATE TABLE footprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    icon VARCHAR(10) DEFAULT '◈',
    is_primary BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    
    -- Profile data (for primary footprint)
    display_name VARCHAR(255),
    handle VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,
    
    -- Customization
    theme VARCHAR(50) DEFAULT 'midnight',
    
    -- Metadata
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, slug)
);

CREATE INDEX idx_footprints_user ON footprints (user_id);
CREATE INDEX idx_footprints_slug ON footprints (slug);

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
-- CONTENT
-- Universal content items - URLs that become embeds
-- =====================================================
CREATE TABLE content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    footprint_id UUID NOT NULL REFERENCES footprints(id) ON DELETE CASCADE,
    
    -- Original URL
    url TEXT NOT NULL,
    
    -- Parsed/enriched data
    type VARCHAR(50) NOT NULL DEFAULT 'link',  -- youtube, spotify, twitter, image, article, link
    title VARCHAR(500),
    description TEXT,
    thumbnail_url TEXT,
    embed_html TEXT,
    
    -- Platform-specific IDs
    external_id VARCHAR(255),  -- YouTube video ID, Spotify track ID, etc.
    
    -- Display
    position INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_footprint ON content (footprint_id);
CREATE INDEX idx_content_position ON content (footprint_id, position);

CREATE TRIGGER content_updated_at
    BEFORE UPDATE ON content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


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
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own data
CREATE POLICY users_own_data ON users
    FOR ALL USING (auth.uid() = id);

-- Footprints: owners can do anything, public ones are viewable
CREATE POLICY footprints_owner ON footprints
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY footprints_public_read ON footprints
    FOR SELECT USING (is_public = TRUE);

-- Content: follows footprint permissions
CREATE POLICY content_owner ON content
    FOR ALL USING (
        footprint_id IN (SELECT id FROM footprints WHERE user_id = auth.uid())
    );

CREATE POLICY content_public_read ON content
    FOR SELECT USING (
        footprint_id IN (SELECT id FROM footprints WHERE is_public = TRUE)
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
-- INITIAL SETUP COMPLETE
-- 
-- Next serial available: 7777
-- Implied existing users: 7776 (manufactured scarcity)
-- =====================================================
