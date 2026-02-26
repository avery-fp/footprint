import { NextRequest, NextResponse } from 'next/server'
import { isPrivateHost } from '@/lib/ssrf'

/**
 * GET /api/og-preview?url=xxx
 *
 * Lightweight OG metadata fetcher for link card tiles.
 * Returns: { title, description, image, favicon, domain }
 * 3-second timeout. If site is slow → returns { domain } only.
 * 24-hour cache. Never proxies content — metadata only.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  // Validate URL
  let parsed: URL
  try {
    parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ domain: url }, { status: 200 })
    }
  } catch {
    return NextResponse.json({ domain: url }, { status: 200 })
  }

  const domain = parsed.hostname.replace('www.', '')

  // SSRF protection — block private/internal IPs
  if (isPrivateHost(parsed.hostname)) {
    return json({ domain })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return json({ domain })
    }

    // Reject oversized responses
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
    if (contentLength > 2 * 1024 * 1024) {
      return json({ domain })
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return json({ domain })
    }

    const html = await res.text()
    const meta = extractMeta(html, url, domain)

    return json(meta)
  } catch {
    // Timeout or network error — return domain-only card
    return json({ domain })
  }
}

function json(data: Record<string, unknown>) {
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
  })
}

function extractMeta(html: string, sourceUrl: string, domain: string) {
  function getContent(property: string): string | null {
    const patterns = [
      new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'),
      new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${property}["']`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) return decode(match[1])
    }
    return null
  }

  function decode(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
  }

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = getContent('og:title') || getContent('twitter:title') || (titleMatch ? decode(titleMatch[1].trim()) : null)

  // Description
  const description = getContent('og:description') || getContent('twitter:description') || getContent('description')

  // Image
  let image: string | null = getContent('og:image') || getContent('twitter:image') || getContent('twitter:image:src')
  if (image && !image.startsWith('http')) {
    try { image = new URL(image, sourceUrl).href } catch { image = null }
  }

  // Favicon — try apple-touch-icon first (higher res), then standard favicon
  let favicon: string | null = null
  const iconPatterns = [
    /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i,
    /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']icon["']/i,
    /<link[^>]*rel=["']shortcut icon["'][^>]*href=["']([^"']+)["']/i,
  ]
  for (const pattern of iconPatterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      favicon = match[1]
      break
    }
  }
  if (favicon && !favicon.startsWith('http')) {
    try { favicon = new URL(favicon, sourceUrl).href } catch { favicon = null }
  }
  // Fallback to Google's favicon service
  if (!favicon) {
    favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  }

  return { title, description, image, favicon, domain }
}
