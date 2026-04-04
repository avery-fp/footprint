/**
 * FOOTPRINT URL PARSER
 * 
 * The core magic: paste any URL, get a beautiful embed.
 * 
 * This detects URL types and returns structured data for rendering.
 * The goal is zero-friction: paste → magic → beautiful.
 */

// Supported content types
export type ContentType =
  | 'youtube'
  | 'spotify'
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'vimeo'
  | 'soundcloud'
  | 'video'
  | 'image'
  | 'thought'
  | 'link'

// What we return after parsing
export interface ParsedContent {
  type: ContentType
  url: string
  external_id: string | null
  title: string
  description: string | null
  thumbnail_url: string | null
  embed_html: string | null
}

// Detection patterns for each platform
const PATTERNS: Record<string, { regex: RegExp; type: ContentType }[]> = {
  youtube: [
    { regex: /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/, type: 'youtube' },
    { regex: /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/, type: 'youtube' },
    { regex: /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/, type: 'youtube' },
  ],
  spotify: [
    { regex: /open\.spotify\.com\/(track|album|playlist|artist|episode)\/([a-zA-Z0-9]+)/, type: 'spotify' },
  ],
  applemusic: [
    { regex: /music\.apple\.com\/([a-z]{2})\/(album|playlist|song|station|music-video)\/([^/?]+)\/([a-z0-9.]+)/i, type: 'link' as const },
  ],
  twitter: [
    { regex: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/, type: 'twitter' },
  ],
  instagram: [
    { regex: /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/, type: 'instagram' },
  ],
  tiktok: [
    { regex: /tiktok\.com\/@([a-zA-Z0-9_.]+)\/video\/(\d+)/, type: 'tiktok' },
    { regex: /vm\.tiktok\.com\/([a-zA-Z0-9]+)/, type: 'tiktok' },
  ],
  vimeo: [
    { regex: /vimeo\.com\/(\d+)/, type: 'vimeo' },
  ],
  soundcloud: [
    { regex: /soundcloud\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)/, type: 'soundcloud' },
  ],
  video: [
    { regex: /\.(mp4|mov|webm|avi|m4v|mkv)(\?.*)?$/i, type: 'video' },
  ],
  image: [
    { regex: /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i, type: 'image' },
  ],
}

/**
 * Main parser function
 * 
 * Takes any URL, figures out what it is, returns structured data.
 * This is where the magic happens.
 */
export async function parseURL(rawUrl: string): Promise<ParsedContent> {
  // Normalize URL
  let url = rawUrl.trim()
  if (!url.startsWith('http')) {
    url = 'https://' + url
  }

  // Block non-HTTP(S) protocols to prevent javascript: / data: XSS
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return parseGenericLink(url)
    }
  } catch {
    return parseGenericLink(url)
  }

  // Try each pattern
  for (const [platform, patterns] of Object.entries(PATTERNS)) {
    for (const { regex, type } of patterns) {
      const match = url.match(regex)
      if (match) {
        return parseByType(type, url, match)
      }
    }
  }

  // Fallback to generic link
  return parseGenericLink(url)
}

/**
 * Route to type-specific parser
 */
async function parseByType(type: ContentType, url: string, match: RegExpMatchArray): Promise<ParsedContent> {
  switch (type) {
    case 'youtube': return parseYouTube(url, match)
    case 'spotify': return await parseSpotify(url, match)
    case 'twitter': return parseTwitter(url, match)
    case 'instagram': return parseInstagram(url, match)
    case 'tiktok': return parseTikTok(url, match)
    case 'vimeo': return parseVimeo(url, match)
    case 'soundcloud': return parseSoundCloud(url, match)
    case 'video': return parseVideo(url)
    case 'image': return parseImage(url)
    default: return parseGenericLink(url)
  }
}

// ============================================
// YOUTUBE
// ============================================
function parseYouTube(url: string, match: RegExpMatchArray): ParsedContent {
  const videoId = match[1]

  return {
    type: 'youtube',
    url,
    external_id: videoId,
    title: 'YouTube Video',
    description: null,
    thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    embed_html: `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&controls=0&rel=0&iv_load_policy=3&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" class="w-full aspect-video "></iframe>`,
  }
}

// ============================================
// SPOTIFY
// Fetches real title + album art via oEmbed (free, no API key)
// ============================================
async function parseSpotify(url: string, match: RegExpMatchArray): Promise<ParsedContent> {
  const contentType = match[1]
  const spotifyId = match[2]

  let title = `Spotify ${contentType}`
  let thumbnail: string | null = null

  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.title) title = data.title
      if (data.thumbnail_url) thumbnail = data.thumbnail_url
    }
  } catch {
    // oEmbed failed — use generic fallback, not a blocker
  }

  return {
    type: 'spotify',
    url,
    external_id: spotifyId,
    title,
    description: null,
    thumbnail_url: thumbnail,
    embed_html: `<iframe src="https://open.spotify.com/embed/${contentType}/${spotifyId}?theme=0" frameborder="0" allowtransparency="true" allow="encrypted-media" loading="lazy" class="w-full "></iframe>`,
  }
}

// ============================================
// APPLE MUSIC
// ============================================
function parseAppleMusic(url: string, match: RegExpMatchArray): ParsedContent {
  const country = match[1] // e.g. 'us'
  const contentType = match[2] // album, playlist, song, etc.
  const slug = match[3] // human-readable slug
  const albumId = match[4] // numeric or alphanumeric id

  // Prefer ?i= track ID (specific song) over album ID
  const trackMatch = url.match(/[?&]i=(\d+)/)
  const id = trackMatch ? trackMatch[1] : albumId

  // Build embed URL — same format as Apple's official embed
  const embedUrl = url.replace('music.apple.com', 'embed.music.apple.com')

  // Clean title from slug
  const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  // Apple Music embeds can't render cleanly — treat as a plain link tile
  return {
    type: 'link',
    url,
    external_id: null,
    title,
    description: 'Apple Music',
    thumbnail_url: null,
    embed_html: null,
  }
}

// ============================================
// TWITTER / X
// ============================================
function parseTwitter(url: string, match: RegExpMatchArray): ParsedContent {
  const username = match[1]
  const tweetId = match[2]
  
  return {
    type: 'twitter',
    url,
    external_id: tweetId,
    title: `Tweet by @${username}`,
    description: null,
    thumbnail_url: null,
    embed_html: `<blockquote class="twitter-tweet" data-theme="dark"><a href="${url}"></a></blockquote>`,
  }
}

// ============================================
// INSTAGRAM
// ============================================
function parseInstagram(url: string, match: RegExpMatchArray): ParsedContent {
  const postId = match[1]
  
  return {
    type: 'instagram',
    url,
    external_id: postId,
    title: 'Instagram Post',
    description: null,
    thumbnail_url: null,
    embed_html: `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14"></blockquote>`,
  }
}

// ============================================
// TIKTOK
// ============================================
function parseTikTok(url: string, match: RegExpMatchArray): ParsedContent {
  const videoId = match[2] || match[1]
  
  return {
    type: 'tiktok',
    url,
    external_id: videoId,
    title: 'TikTok Video',
    description: null,
    thumbnail_url: null,
    embed_html: `<blockquote class="tiktok-embed" data-video-id="${videoId}"><a href="${url}"></a></blockquote>`,
  }
}

// ============================================
// VIMEO
// ============================================
function parseVimeo(url: string, match: RegExpMatchArray): ParsedContent {
  const videoId = match[1]
  
  return {
    type: 'vimeo',
    url,
    external_id: videoId,
    title: 'Vimeo Video',
    description: null,
    thumbnail_url: null,
    embed_html: `<iframe src="https://player.vimeo.com/video/${videoId}?color=ffffff&title=0&byline=0&portrait=0&badge=0&dnt=1" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" class="w-full aspect-video "></iframe>`,
  }
}

// ============================================
// SOUNDCLOUD
// ============================================
function parseSoundCloud(url: string, match: RegExpMatchArray): ParsedContent {
  return {
    type: 'soundcloud',
    url,
    external_id: null,
    title: 'SoundCloud Track',
    description: null,
    thumbnail_url: null,
    embed_html: `<iframe src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ffffff&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=true" frameborder="0" allow="autoplay" loading="lazy" class="w-full h-[166px] "></iframe>`,
  }
}

// ============================================
// VIDEO
// ============================================
function parseVideo(url: string): ParsedContent {
  const filename = url.split('/').pop()?.split('?')[0] || 'Video'

  return {
    type: 'video',
    url,
    external_id: null,
    title: filename,
    description: null,
    thumbnail_url: null,
    embed_html: null, // Rendered as native video in ContentCard
  }
}

// ============================================
// IMAGE
// ============================================
function parseImage(url: string): ParsedContent {
  const filename = url.split('/').pop()?.split('?')[0] || 'Image'
  // Escape for safe HTML attribute injection
  const safeAlt = filename.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeUrl = url.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return {
    type: 'image',
    url,
    external_id: null,
    title: filename,
    description: null,
    thumbnail_url: url,
    embed_html: `<img src="${safeUrl}" alt="${safeAlt}" class="w-full" loading="lazy" />`,
  }
}

// ============================================
// GENERIC LINK (fallback)
// ============================================
function parseGenericLink(url: string): ParsedContent {
  let hostname = 'Link'
  try {
    hostname = new URL(url).hostname.replace('www.', '')
  } catch {}
  
  return {
    type: 'link',
    url,
    external_id: null,
    title: hostname,
    description: null,
    thumbnail_url: null,
    embed_html: null, // Rendered as link card in UI
  }
}

// ============================================
// ICON HELPER
// ============================================
export function getContentIcon(type: ContentType): string {
  const icons: Record<ContentType, string> = {
    youtube: '▶',
    spotify: '♫',
    twitter: '𝕏',
    instagram: '◎',
    tiktok: '♪',
    vimeo: '▶',
    soundcloud: '♫',
    video: '▶',
    image: '▣',
    thought: '◈',
    link: '◎',
  }
  return icons[type] || '◎'
}

// ============================================
// BACKGROUND HELPER
// ============================================
export function getContentBackground(type: ContentType): string | null {
  const backgrounds: Partial<Record<ContentType, string>> = {
  }
  return backgrounds[type] || null
}
