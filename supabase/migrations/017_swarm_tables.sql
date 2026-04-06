-- Email Swarm infrastructure tables
-- Google Maps scrape → LLM Mirror Hook → SES Send → Monitor

-- Scraped business targets from Google Maps
CREATE TABLE IF NOT EXISTS swarm_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id TEXT UNIQUE NOT NULL,          -- Google Maps place_id (dedup key)
  name TEXT NOT NULL,
  category TEXT NOT NULL,                 -- e.g. 'barbershop', 'tattoo_parlor'
  city TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'US',
  address TEXT,
  phone TEXT,
  website TEXT,
  email TEXT,                             -- enriched from website scraping
  email_source TEXT,                      -- 'website_scrape', 'constructed', 'hunter'
  rating NUMERIC(2,1),
  review_count INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,               -- targeting score (higher = better fit)
  status TEXT DEFAULT 'scraped'           -- scraped, enriched, messaged, sent, bounced, converted
    CHECK (status IN ('scraped', 'enriched', 'messaged', 'sent', 'bounced', 'converted', 'unsubscribed')),
  scraped_at TIMESTAMPTZ DEFAULT now(),
  enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swarm_targets_status ON swarm_targets(status);
CREATE INDEX IF NOT EXISTS idx_swarm_targets_city_cat ON swarm_targets(city, category);
CREATE INDEX IF NOT EXISTS idx_swarm_targets_email ON swarm_targets(email) WHERE email IS NOT NULL;

-- LLM-generated mirror hook messages
CREATE TABLE IF NOT EXISTS swarm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES swarm_targets(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  hook_style TEXT DEFAULT 'mirror',       -- mirror, direct, value
  model TEXT,                             -- claude-sonnet-4-5-20241022, etc.
  tokens_used INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(target_id)                       -- one message per target
);

CREATE INDEX IF NOT EXISTS idx_swarm_messages_target ON swarm_messages(target_id);

-- Email send tracking
CREATE TABLE IF NOT EXISTS swarm_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES swarm_targets(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES swarm_messages(id) ON DELETE CASCADE,
  ses_message_id TEXT,                    -- SES MessageId for tracking
  provider TEXT NOT NULL,                 -- ses-us-east-1, ses-us-west-2, resend, etc.
  from_domain TEXT NOT NULL,              -- footprint.site, footprint.onl, etc.
  status TEXT DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swarm_sends_status ON swarm_sends(status);
CREATE INDEX IF NOT EXISTS idx_swarm_sends_domain ON swarm_sends(from_domain);
CREATE INDEX IF NOT EXISTS idx_swarm_sends_sent_at ON swarm_sends(sent_at) WHERE sent_at IS NOT NULL;

-- Domain health tracking for sending reputation
CREATE TABLE IF NOT EXISTS swarm_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT UNIQUE NOT NULL,            -- footprint.site, footprint.onl, etc.
  region TEXT NOT NULL,                   -- us-east-1, us-west-2, eu-west-1
  daily_limit INTEGER DEFAULT 1000,       -- max sends per day during warmup
  sent_today INTEGER DEFAULT 0,
  bounced_today INTEGER DEFAULT 0,
  complained_today INTEGER DEFAULT 0,
  bounce_rate NUMERIC(5,4) DEFAULT 0,     -- running bounce rate
  complaint_rate NUMERIC(5,4) DEFAULT 0,  -- running complaint rate
  status TEXT DEFAULT 'warming'
    CHECK (status IN ('warming', 'active', 'paused', 'suspended')),
  warmup_day INTEGER DEFAULT 1,           -- day N of warmup schedule
  last_sent_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swarm_domains_status ON swarm_domains(status);

-- Scrape job tracking (which city/category combos have been scraped)
CREATE TABLE IF NOT EXISTS swarm_scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  category TEXT NOT NULL,
  radius_meters INTEGER DEFAULT 50000,
  results_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(city, category)
);

-- Daily counter reset function
CREATE OR REPLACE FUNCTION swarm_reset_daily_counters()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE swarm_domains
  SET sent_today = 0,
      bounced_today = 0,
      complained_today = 0,
      last_reset_at = now()
  WHERE last_reset_at < CURRENT_DATE;
END;
$$;
