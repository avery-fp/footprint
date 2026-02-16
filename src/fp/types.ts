/**
 * Shared types for the footprint autonomous pipeline.
 *
 * Data flow:
 *   clock.scan() → ClockNoun[]
 *   taste.curate(TasteInput) → MintPayload
 *   autoMint → POST /api/aro/mint → MintResult
 *   screenshot.capture() → ScreenshotResult
 *   postpack.generate() → PostpackContent[]
 *   deploy.place() → DeployResult
 *   darwin.analyze() → DarwinFeedback → feeds back into taste
 */

// ─── Clock ───────────────────────────────────────────────

export interface ClockNoun {
  noun: string
  urgency: number       // 0–1, higher = more timely
  source: string        // 'bing-news' | 'bing-trending' | 'manual'
  category: string      // 'culture' | 'sports' | 'music' | 'fashion' | 'tech' | 'art'
  trend_score: number   // raw trend signal
  snippet: string       // brief context for the taste agent
}

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

// ─── Screenshot ──────────────────────────────────────────

export interface ScreenshotResult {
  slug: string
  screenshots: Record<string, string>  // format → public URL
}

// ─── Postpack ────────────────────────────────────────────

export interface PostpackInput {
  slug: string
  display_name: string
  bio: string
  category: string
  room_url: string
  screenshots: Record<string, string>
}

export interface PostpackContent {
  surface: string       // 'reddit' | 'twitter' | 'instagram' | 'tiktok' | 'pinterest'
  caption: string
  hashtags: string[]
  image_format: string  // which screenshot format to use: '1x1' | '4x5' | '16x9' | '9x16'
  image_url: string     // screenshot URL for this format
  cta_url: string       // footprint.onl/{slug}
}

// ─── Deploy ──────────────────────────────────────────────

export interface DeployMeta {
  serial_number: number
  room_id: string
  pack_id?: string
}

export interface DeployResult {
  event_id: string
  surface: string
  channel: string
  placement_url?: string
}

// ─── Darwin ──────────────────────────────────────────────

export interface DarwinFeedback {
  top_themes: string[]
  top_categories: string[]
  avoid_themes: string[]
  conversion_rate: number
  best_surfaces: string[]
  sample_size: number
  recommendations: string[]
}

// ─── Pipeline ────────────────────────────────────────────

export interface PipelineOptions {
  mode: 'auto' | 'batch' | 'mint'
  count?: number             // batch mode: how many to mint
  noun?: string              // mint mode: specific noun
  dry_run?: boolean          // skip actual minting
  skip_screenshots?: boolean
  skip_deploy?: boolean
}

export interface PipelineResult {
  noun: string
  mint?: MintResult
  screenshots?: ScreenshotResult
  postpacks?: PostpackContent[]
  deployments?: DeployResult[]
  error?: string
}
