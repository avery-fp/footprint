/**
 * OG / link metadata extractor
 *
 * Pure HTML → preview-shape function. Used by /api/link-preview as the
 * shared Footprint ingestion primitive: any pasted/saved URL gets a
 * useful preview card without provider-specific code.
 *
 * Output never throws and never returns undefined fields. Image URLs are
 * resolved against the source URL and validated as http(s).
 */
export interface LinkPreview {
  url: string
  canonical: string | null
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  type: string | null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function metaContent(html: string, key: string, attr: 'property' | 'name'): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m && m[1]) return decodeEntities(m[1]).trim() || null
  }
  return null
}

function og(html: string, key: string): string | null {
  return metaContent(html, key, 'property') ?? metaContent(html, key, 'name')
}

function resolveUrl(raw: string | null, base: string): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

function canonical(html: string, base: string): string | null {
  const m =
    html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)
  return resolveUrl(m?.[1] ?? null, base)
}

function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || null : null
}

export function extractLinkPreview(html: string, sourceUrl: string): LinkPreview {
  const ogTitle = og(html, 'og:title') || og(html, 'twitter:title')
  const ogDesc = og(html, 'og:description') || og(html, 'twitter:description') || og(html, 'description')
  const ogImage = og(html, 'og:image') || og(html, 'twitter:image') || og(html, 'twitter:image:src')
  const ogUrl = og(html, 'og:url')
  const ogSite = og(html, 'og:site_name')
  const ogType = og(html, 'og:type')

  return {
    url: sourceUrl,
    canonical: resolveUrl(ogUrl, sourceUrl) || canonical(html, sourceUrl),
    title: ogTitle || pageTitle(html),
    description: ogDesc,
    image: resolveUrl(ogImage, sourceUrl),
    siteName: ogSite,
    type: ogType,
  }
}

export interface FetchPreviewOptions {
  timeoutMs?: number
  maxBytes?: number
}

export async function fetchLinkPreview(
  url: string,
  opts: FetchPreviewOptions = {}
): Promise<LinkPreview | null> {
  const timeoutMs = opts.timeoutMs ?? 6000
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return null

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
    if (contentLength && contentLength > maxBytes) return null

    const contentType = res.headers.get('content-type') || ''
    if (contentType.startsWith('image/')) {
      return {
        url,
        canonical: null,
        title: null,
        description: null,
        image: url,
        siteName: null,
        type: 'image',
      }
    }
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null
    }

    const html = await res.text()
    return extractLinkPreview(html, url)
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
