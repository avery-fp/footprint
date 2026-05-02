/**
 * FOOTPRINT — LINK OBJECT NORMALIZER
 *
 * normalizeLinkObject(url, meta?, overrideKind?) → LinkObject
 *
 * Clean, sanitized descriptor for any external URL.
 * title and provider are always non-empty strings.
 * image is null if missing or not a valid http(s) URL.
 * No field is ever undefined.
 */

export type RenderKind = 'artifact' | 'music' | 'reader' | 'video' | 'portal'

export interface LinkObject {
  sourceUrl: string
  provider: string       // never empty
  renderKind: RenderKind
  title: string          // never empty
  creator: string | null
  image: string | null   // null if invalid or missing
  description: string | null
  actionUrl: string
  confidence: 'high' | 'low'
}

// Collection-like paths on appropriate platforms → portal
const COLLECTION_PATH = /\/(favorites|user|list|watchlist|collection|board|playlist)(\/|$|\?)/i

// Article domains and path patterns → reader
const ARTICLE_DOMAINS = /\b(substack|medium|ghost|beehiiv|wordpress|blogspot|tumblr|hashnode)\b/i
const ARTICLE_PATHS = /\/(p\/|post\/|article\/|blog\/|story\/|entry\/|\d{4}\/\d{2}\/)/i

// Known provider labels keyed by URL pattern (checked in order)
const PROVIDER_LABELS: Array<[RegExp, string]> = [
  [/open\.spotify\.com/i, 'Spotify'],
  [/music\.apple\.com/i, 'Apple Music'],
  [/(?:youtube\.com|youtu\.be)/i, 'YouTube'],
  [/(?:twitter\.com|x\.com)/i, 'X'],
  [/soundcloud\.com/i, 'SoundCloud'],
  [/vimeo\.com/i, 'Vimeo'],
  [/instagram\.com/i, 'Instagram'],
  [/tiktok\.com/i, 'TikTok'],
  [/substack\.com/i, 'Substack'],
  [/medium\.com/i, 'Medium'],
  [/grailed\.com/i, 'Grailed'],
  [/letterboxd\.com/i, 'Letterboxd'],
  [/github\.com/i, 'GitHub'],
]

export function getProviderName(url: string): string {
  for (const [pattern, name] of PROVIDER_LABELS) {
    if (pattern.test(url)) return name
  }
  return getCleanDomain(url)
}

function getCleanDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'link'
  } catch {
    return 'link'
  }
}

function isValidImageUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    const p = new URL(trimmed)
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}

function deriveRenderKind(url: string): RenderKind {
  if (/open\.spotify\.com/i.test(url)) return 'music'
  if (/music\.apple\.com/i.test(url)) return 'music'
  if (/(?:youtube\.com|youtu\.be)/i.test(url)) return 'video'
  if (/(?:twitter\.com|x\.com)/i.test(url)) return 'artifact'

  // Portal only for collection-like paths on matching platforms
  if (/(?:grailed\.com|letterboxd\.com)/i.test(url) && COLLECTION_PATH.test(url)) {
    return 'portal'
  }

  // Reader for article-like domains or paths
  if (ARTICLE_DOMAINS.test(url) || ARTICLE_PATHS.test(url)) return 'reader'

  return 'artifact'
}

export function sanitizeLinkMeta(
  raw: {
    title?: string | null
    description?: string | null
    image?: string | null
    author?: string | null
    creator?: string | null
  },
  url: string
): {
  title: string
  creator: string | null
  description: string | null
  image: string | null
  provider: string
} {
  const title = raw.title?.trim() || getCleanDomain(url) || 'link'
  const creator = raw.author?.trim() || raw.creator?.trim() || null
  const description = raw.description?.trim() || null
  const image = isValidImageUrl(raw.image) ? raw.image!.trim() : null
  const provider = getProviderName(url)

  return { title, creator, description, image, provider }
}

export function normalizeLinkObject(
  url: string,
  meta?: {
    title?: string | null
    description?: string | null
    image?: string | null
    author?: string | null
    creator?: string | null
  },
  overrideKind?: RenderKind
): LinkObject {
  const sanitized = sanitizeLinkMeta(meta ?? {}, url)
  const renderKind = overrideKind ?? deriveRenderKind(url)

  return {
    sourceUrl: url,
    provider: sanitized.provider,
    renderKind,
    title: sanitized.title,
    creator: sanitized.creator,
    image: sanitized.image,
    description: sanitized.description,
    actionUrl: url,
    confidence: renderKind === 'artifact' ? 'low' : 'high',
  }
}
