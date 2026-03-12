-- NEEDFIELD: Human-in-the-loop acquisition console
-- Stores pain signal leads with scored variants for manual deployment.

CREATE TABLE IF NOT EXISTS aro_needfield (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                     -- 'reddit' | 'hn'
  subreddit TEXT,                           -- e.g., 'r/webdesign' (null for HN)
  thread_url TEXT NOT NULL,
  thread_title TEXT NOT NULL,
  snippet TEXT,
  author TEXT,
  pain_label TEXT NOT NULL,                 -- e.g., 'aesthetic_dissatisfaction'
  priority_score INTEGER NOT NULL CHECK (priority_score BETWEEN 1 AND 10),
  variant_a TEXT NOT NULL,                  -- Pure Value (no link)
  variant_b TEXT NOT NULL,                  -- Soft Intrigue (mentions Footprint, no link)
  variant_c TEXT NOT NULL,                  -- Direct Proof (includes sly link)
  sid UUID NOT NULL DEFAULT gen_random_uuid(),
  engagement JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ
);

-- Fast queries for the dashboard
CREATE INDEX IF NOT EXISTS idx_needfield_status ON aro_needfield(status);
CREATE INDEX IF NOT EXISTS idx_needfield_priority ON aro_needfield(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_needfield_sid ON aro_needfield(sid);
CREATE INDEX IF NOT EXISTS idx_needfield_url ON aro_needfield(thread_url);
