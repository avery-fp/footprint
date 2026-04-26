/**
 * FOOTPRINT — UNIVERSAL EMBED ENGINE
 *
 * parseEmbed(url) → { platform, embedUrl, height, aspectRatio, tier } | null
 *
 * If it returns a result → render iframe embed tile
 * If it returns null → render link card tile
 *
 * Each platform is one function. Adding a platform = one regex + one URL template.
 */

export type EmbedPlatform =
  | 'spotify'
  | 'youtube'
  | 'soundcloud'
  | 'vimeo'
  | 'bandcamp'
  | 'google-maps'
  | 'codepen'
  | 'arena'
  | 'figma'

export interface EmbedResult {
  platform: EmbedPlatform
  embedUrl: string
  height: number
  aspectRatio?: string
  tier: 1 | 2
}

// ── TIER 1 — battle-tested, never break ─────────────────────

function parseSpotify(url: string): EmbedResult | null {
  const m = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
  if (!m) return null
  const type = m[1]
  const id = m[2]
  const isCollection = ['playlist', 'album', 'artist', 'show'].includes(type)
  return {
    platform: 'spotify',
    embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0&hide_cover=0`,
    height: isCollection ? 352 : 152,
    tier: 1,
  }
}

function parseYouTube(url: string): EmbedResult | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  )
  if (!m) return null
  return {
    platform: 'youtube',
    // Facade mode — autoplay off. The iframe mounted on tap uses the default (autoplay on).
    embedUrl: buildYouTubeEmbedUrl(m[1], { autoplay: false, mute: false }),
    height: 0, // aspect-ratio driven
    aspectRatio: '16/9',
    tier: 1,
  }
}

// Apple Music embeds removed — treated as regular link tiles

function parseSoundCloud(url: string): EmbedResult | null {
  const m = url.match(/soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/)
  if (!m) return null
  const isPlaylist = url.includes('/sets/')
  return {
    platform: 'soundcloud',
    embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ffffff&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=true`,
    height: isPlaylist ? 300 : 166,
    tier: 1,
  }
}

function parseVimeo(url: string): EmbedResult | null {
  const m = url.match(/vimeo\.com\/(\d+)/)
  if (!m) return null
  return {
    platform: 'vimeo',
    embedUrl: `https://player.vimeo.com/video/${m[1]}?title=0&byline=0&portrait=0&badge=0&dnt=1`,
    height: 0,
    aspectRatio: '16/9',
    tier: 1,
  }
}

// ── TIER 2 — work usually, fallback if not ──────────────────

function parseBandcamp(url: string): EmbedResult | null {
  // Bandcamp requires oEmbed or album/track IDs which aren't in the URL.
  // We detect the URL pattern and pass it to a special iframe approach.
  const m = url.match(/([a-zA-Z0-9_-]+)\.bandcamp\.com\/(album|track)\/([a-zA-Z0-9_-]+)/)
  if (!m) return null
  // Bandcamp embeds need the numeric ID which isn't in the URL.
  // Use the /EmbeddedPlayer path with the URL — Bandcamp resolves it.
  return {
    platform: 'bandcamp',
    embedUrl: `https://bandcamp.com/EmbeddedPlayer/size=large/bgcol=000000/linkcol=ffffff/tracklist=false/artwork=small/transparent=true/url=${encodeURIComponent(url)}`,
    height: 120,
    tier: 2,
  }
}

function parseGoogleMaps(url: string): EmbedResult | null {
  // google.com/maps/place/... or maps.google.com or goo.gl/maps
  const m = url.match(/google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps/)
  if (!m) return null
  return {
    platform: 'google-maps',
    embedUrl: `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(url)}`,
    height: 300,
    tier: 2,
  }
}

function parseCodePen(url: string): EmbedResult | null {
  const m = url.match(/codepen\.io\/([a-zA-Z0-9_-]+)\/(?:pen|full)\/([a-zA-Z0-9]+)/)
  if (!m) return null
  return {
    platform: 'codepen',
    embedUrl: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result&theme-id=dark`,
    height: 300,
    tier: 2,
  }
}

function parseArena(url: string): EmbedResult | null {
  const m = url.match(/are\.na\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/)
  if (!m) return null
  return {
    platform: 'arena',
    embedUrl: `https://www.are.na/${m[1]}/${m[2]}/embed`,
    height: 300,
    tier: 2,
  }
}

function parseFigma(url: string): EmbedResult | null {
  const m = url.match(/figma\.com\/(file|proto|design|board)\/([a-zA-Z0-9]+)/)
  if (!m) return null
  return {
    platform: 'figma',
    embedUrl: `https://www.figma.com/embed?embed_host=footprint&url=${encodeURIComponent(url)}`,
    height: 0,
    aspectRatio: '16/9',
    tier: 2,
  }
}

// ── YouTube embed URL builder — one source of truth ────────
// Spec: AE Presentation Layer — Task 2 (YouTube Consolidation)
// Every `youtube-nocookie.com/embed/...` URL in the app goes through this.
// Default params enforce de-branding: modestbranding + rel=0 + iv_load_policy=3.
// autoplay/mute default true because the dominant call site is the facade
// iframe mounted on tap, where autoplay is desired; `mute=1` is required for
// mobile-Safari autoplay compliance. Callers that need a non-autoplaying URL
// (e.g. parseYouTube below, for the identity-intake pipeline) pass
// `{ autoplay: false, mute: false }` explicitly.
export function buildYouTubeEmbedUrl(
  videoId: string,
  opts: {
    autoplay?: boolean
    mute?: boolean
    start?: number
    /** Clip end (seconds). YouTube stops playback at this point. */
    end?: number
    /** Force 1080p quality hints (vq=hd1080, hd=1). Best-effort — YouTube
     *  auto-selects based on bandwidth/viewport, but these flags nudge it. */
    hd?: boolean
  } = {}
): string {
  const { autoplay = true, mute = true, start = 0, end = 0, hd = false } = opts
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: mute ? '1' : '0',
    enablejsapi: '1',
    controls: '0',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    playsinline: '1',
  })
  if (start > 0) params.set('start', String(start))
  if (end > 0) params.set('end', String(end))
  if (hd) { params.set('vq', 'hd1080'); params.set('hd', '1') }
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

// ── Main entry point ────────────────────────────────────────

const PARSERS: Array<(url: string) => EmbedResult | null> = [
  // Tier 1
  parseSpotify,
  parseYouTube,
  parseSoundCloud,
  parseVimeo,
  // Tier 2
  parseBandcamp,
  parseGoogleMaps,
  parseCodePen,
  parseArena,
  parseFigma,
]

export function parseEmbed(url: string): EmbedResult | null {
  if (!url) return null
  for (const parser of PARSERS) {
    const result = parser(url)
    if (result) return result
  }
  return null
}

/**
 * Extract a YouTube video ID from any YouTube URL format.
 * Returns null for non-YouTube URLs.
 */
export function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/
  )
  return m ? m[1] : null
}

/**
 * Get a YouTube thumbnail URL for facade rendering.
 * Returns maxresdefault; caller should fallback to hqdefault on error.
 */
export function getYouTubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : null
}
