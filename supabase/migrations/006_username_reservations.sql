-- =====================================================
-- USERNAME RESERVATIONS
-- Temporary holds during signup flow (15 min TTL)
-- =====================================================

CREATE TABLE IF NOT EXISTS username_reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  token UUID DEFAULT gen_random_uuid() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reservations_expires ON username_reservations(expires_at);
CREATE INDEX idx_reservations_token ON username_reservations(token);
