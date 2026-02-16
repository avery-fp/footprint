/**
 * Shared types for the footprint autonomous pipeline.
 */

// ─── Taste ───────────────────────────────────────────────

export interface TasteInput {
  noun: string
  urgency?: number
  category?: string
  snippet?: string
  feedback?: DarwinFeedback
}

export interface CreativeBrief {
  slug: string
  display_name: string
  bio: string
  theme_id: string
  image_queries: string[]
  wallpaper_query: string
  music_query: string
  embed_queries: string[]
}

export interface MintPayload {
  aro_key: string
  slug: string
  room_name: string
  image_urls: string[]
  embed_urls: string[]
  wallpaper_url?: string
  music_url?: string
  theme_id: string
  display_name: string
  bio: string
  metadata?: Record<string, any>
}

export interface MintResult {
  slug: string
  room_id: string
  room_url: string
  tile_count: number
  serial_number: number
}

// ─── Pipeline ────────────────────────────────────────────

export interface PipelineOptions {
  mode: 'auto' | 'batch' | 'mint'
  count?: number
  noun?: string
  dry_run?: boolean
  skip_screenshots?: boolean
  skip_deploy?: boolean
}

export interface PipelineResult {
  noun: string
  mint?: MintResult
  error?: string
}

// ─── Darwin (stub for taste feedback interface) ──────────

export interface DarwinFeedback {
  top_themes: string[]
  top_categories: string[]
  avoid_themes: string[]
  conversion_rate: number
  best_surfaces: string[]
  sample_size: number
  recommendations: string[]
}
