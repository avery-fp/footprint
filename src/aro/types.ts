// ARO Intelligence Layer — shared types

export interface Category {
  id: string
  name: string
  parent: string | null
  tags: string[]
  created_at: string
}

export interface Target {
  id: string
  platform: string
  username: string
  display_name: string | null
  url: string | null
  category_id: string | null
  follower_count: number | null
  link_in_bio: boolean
  signals: Record<string, unknown>
  influence_score: number
  conversion_probability: number
  layer: number
  void_flag: boolean
  status: string
  created_at: string
}

export interface Serial {
  id: string
  serial_number: number
  reserved: boolean
  assigned_target_id: string | null
  claimed: boolean
  claimed_at: string | null
  created_at: string
}

export interface MessageVariant {
  id: string
  name: string
  layer: number
  category_id: string | null
  template: string
  max_words: number
  active: boolean
  created_at: string
}

export interface Message {
  id: string
  target_id: string
  serial_number: number
  variant_id: string
  body: string
  channel: string
  scheduled_at: string | null
  created_at: string
}

export interface DistributionPlan {
  id: string
  name: string
  plan_json: PlanJSON
  start_at: string
  end_at: string
  created_at: string
}

export interface PlanJSON {
  waves: Wave[]
  channels: string[]
  total_messages: number
  duration_hours: number
}

export interface Wave {
  name: string
  start_offset_hours: number
  targets: string[]
  channel: string
  priority: number
}

export interface AROEvent {
  id: string
  target_id: string | null
  message_id: string | null
  channel: string | null
  event_type: 'sent' | 'open' | 'click' | 'convert' | 'unsub' | 'bounce'
  event_value: number | null
  meta: Record<string, unknown>
  occurred_at: string
  created_at: string
}

export interface LearningSnapshot {
  id: string
  snapshot_json: Record<string, unknown>
  created_at: string
}

export interface Lift {
  byLayer: Record<number, { sent: number; clicks: number; converts: number; rate: number }>
  byCategory: Record<string, { sent: number; clicks: number; converts: number; rate: number }>
  byVariant: Record<string, { sent: number; clicks: number; converts: number; rate: number }>
  byChannel: Record<string, { sent: number; clicks: number; converts: number; rate: number }>
}

export interface TargetCSVRow {
  platform: string
  username: string
  display_name?: string
  url?: string
  category: string
  followers?: string
  link_in_bio?: string
  layer?: string
  signals_json?: string
}

export interface EventCSVRow {
  occurred_at: string
  event_type: string
  channel: string
  username?: string
  serial_number?: string
  variant_name?: string
  value?: string
  meta_json?: string
}

// ─── Email Swarm Types ───────────────────────────────────

export interface SwarmTarget {
  id: string
  place_id: string
  name: string
  category: string
  city: string
  state: string | null
  country: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
  email_source: 'website_scrape' | 'constructed' | 'hunter' | null
  rating: number | null
  review_count: number
  score: number
  status: 'scraped' | 'enriched' | 'messaged' | 'sent' | 'bounced' | 'converted' | 'unsubscribed'
  scraped_at: string
  enriched_at: string | null
  created_at: string
}

export interface SwarmMessage {
  id: string
  target_id: string
  subject: string
  body_html: string
  body_text: string
  hook_style: 'mirror' | 'direct' | 'value'
  model: string | null
  tokens_used: number
  generated_at: string
  created_at: string
}

export interface SwarmSend {
  id: string
  target_id: string
  message_id: string
  ses_message_id: string | null
  provider: string
  from_domain: string
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
  error: string | null
  sent_at: string | null
  delivered_at: string | null
  bounced_at: string | null
  created_at: string
}

export interface SwarmDomain {
  id: string
  domain: string
  region: string
  daily_limit: number
  sent_today: number
  bounced_today: number
  complained_today: number
  bounce_rate: number
  complaint_rate: number
  status: 'warming' | 'active' | 'paused' | 'suspended'
  warmup_day: number
  last_sent_at: string | null
  last_reset_at: string
  created_at: string
}

export interface SwarmScrapeJob {
  id: string
  city: string
  category: string
  radius_meters: number
  results_count: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface MirrorHookInput {
  business_name: string
  category: string
  city: string
  website_copy: string | null
  rating: number | null
  review_count: number
}

export interface MirrorHookOutput {
  subject: string
  body_html: string
  body_text: string
  hook_style: 'mirror' | 'direct' | 'value'
  model: string
  tokens_used: number
}

export interface SESRegionConfig {
  region: string
  accessKeyId: string
  secretAccessKey: string
  fromAddress: string
  domain: string
}

export interface SwarmCycleResult {
  scraped: number
  enriched: number
  mirrored: number
  sent: number
  bounced: number
  errors: string[]
}
