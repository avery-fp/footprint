import { NextRequest, NextResponse } from 'next/server'
import { validateFetchUrl } from '@/lib/ssrf'

export const dynamic = 'force-dynamic'

/**
 * GET /api/metadata?url=xxx
 *
 * Fetches Open Graph metadata from any URL.
 * Returns: title, description, image, siteName, type.
 * Used by editor paste handler for auto-filling tile data.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  // SSRF protection — block private/internal hosts
  const check = validateFetchUrl(url)
  if (!check.valid) {
    return NextResponse.json({ error: check.error }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

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
      return NextResponse.json({ error: 'Failed to fetch URL', status: res.status }, { status: 502 })
    }

    // Reject responses larger than 2MB to prevent memory exhaustion
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
    if (contentLength > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Response too large' }, { status: 502 })
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({
        url,
        title: null,
        description: null,
        image: null,
        siteName: null,
        type: contentType.startsWith('image/') ? 'image' : 'link',
      })
    }

    const html = await res.text()
    const meta = extractOG(html, url)

    return NextResponse.json(meta, {
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    })
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 })
  }
}

function extractOG(html: string, sourceUrl: string) {
  function getContent(property: string): string | null {
    const patterns = [
      new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'),
      new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${property}["']`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) return decodeHTML(match[1])
    }
    return null
  }

  function decodeHTML(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
  }

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const fallbackTitle = titleMatch ? decodeHTML(titleMatch[1].trim()) : null

  let image = getContent('og:image') || getContent('twitter:image') || getContent('twitter:image:src')
  if (image && !image.startsWith('http')) {
    try {
      image = new URL(image, sourceUrl).href
    } catch {
      image = null
    }
  }

  return {
    url: getContent('og:url') || sourceUrl,
    title: getContent('og:title') || getContent('twitter:title') || fallbackTitle,
    description: getContent('og:description') || getContent('twitter:description') || getContent('description'),
    image,
    siteName: getContent('og:site_name'),
    type: getContent('og:type') || 'link',
    themeColor: getContent('theme-color'),
  }
}
