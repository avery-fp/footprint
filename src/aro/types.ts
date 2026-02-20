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
