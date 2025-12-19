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
  | 'image'
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
  ],
  spotify: [
    { regex: /open\.spotify\.com\/(track|album|playlist|artist|episode)\/([a-zA-Z0-9]+)/, type: 'spotify' },
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
function parseByType(type: ContentType, url: string, match: RegExpMatchArray): ParsedContent {
  switch (type) {
    case 'youtube': return parseYouTube(url, match)
    case 'spotify': return parseSpotify(url, match)
    case 'twitter': return parseTwitter(url, match)
    case 'instagram': return parseInstagram(url, match)
    case 'tiktok': return parseTikTok(url, match)
    case 'vimeo': return parseVimeo(url, match)
    case 'soundcloud': return parseSoundCloud(url, match)
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
    embed_html: `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full aspect-video rounded-xl"></iframe>`,
  }
}

// ============================================
// SPOTIFY
// ============================================
function parseSpotify(url: string, match: RegExpMatchArray): ParsedContent {
  const contentType = match[1] // track, album, playlist, etc.
  const spotifyId = match[2]
  const height = contentType === 'track' ? 152 : 352
  
  return {
    type: 'spotify',
    url,
    external_id: spotifyId,
    title: `Spotify ${contentType}`,
    description: null,
    thumbnail_url: null,
    embed_html: `<iframe src="https://open.spotify.com/embed/${contentType}/${spotifyId}?theme=0" frameborder="0" allowtransparency="true" allow="encrypted-media" class="w-full rounded-xl" style="height: ${height}px"></iframe>`,
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
    embed_html: `<iframe src="https://player.vimeo.com/video/${videoId}?color=ffffff&title=0&byline=0&portrait=0" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen class="w-full aspect-video rounded-xl"></iframe>`,
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
    embed_html: `<iframe src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ffffff&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true" frameborder="0" allow="autoplay" class="w-full h-[166px] rounded-xl"></iframe>`,
  }
}

// ============================================
// IMAGE
// ============================================
function parseImage(url: string): ParsedContent {
  const filename = url.split('/').pop()?.split('?')[0] || 'Image'
  
  return {
    type: 'image',
    url,
    external_id: null,
    title: filename,
    description: null,
    thumbnail_url: url,
    embed_html: `<img src="${url}" alt="${filename}" class="w-full rounded-xl" loading="lazy" />`,
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
    image: '▣',
    link: '◎',
  }
  return icons[type] || '◎'
}

// ============================================
// BACKGROUND HELPER
// ============================================
export function getContentBackground(type: ContentType): string | null {
  const backgrounds: Partial<Record<ContentType, string>> = {
    spotify: 'linear-gradient(135deg, #1DB954, #191414)',
    soundcloud: 'linear-gradient(135deg, #ff5500, #ff7700)',
  }
  return backgrounds[type] || null
}
