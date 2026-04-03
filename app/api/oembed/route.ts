import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/oembed
 *
 * Fetch oEmbed metadata from platform endpoints (no API keys needed).
 * Returns { title, artist, thumbnail_url, media_id }.
 *
 * Timeout: 3 seconds. Fallback: hostname as title, nulls for the rest.
 */

const OEMBED_ENDPOINTS: Record<string, (url: string) => string> = {
  youtube: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  spotify: (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
  soundcloud: (url) => `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  vimeo: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  twitter: (url) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`,
  tiktok: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
}

function detectPlatform(url: string): string | null {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
  if (/open\.spotify\.com/.test(url)) return 'spotify'
  if (/soundcloud\.com/.test(url)) return 'soundcloud'
  if (/vimeo\.com/.test(url)) return 'vimeo'
  if (/twitter\.com|x\.com/.test(url)) return 'twitter'
  if (/tiktok\.com/.test(url)) return 'tiktok'
  return null
}

function extractMediaId(url: string, platform: string): string | null {
  switch (platform) {
    case 'youtube': {
      const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/)
      return m ? m[1] : null
    }
    case 'spotify': {
      const m = url.match(/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/)
      return m ? m[2] : null
    }
    case 'soundcloud':
      return null // SoundCloud doesn't expose numeric IDs in URLs
    case 'vimeo': {
      const m = url.match(/vimeo\.com\/(\d+)/)
      return m ? m[1] : null
    }
    default:
      return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    const platform = detectPlatform(url)
    let hostname = 'Link'
    try { hostname = new URL(url).hostname.replace('www.', '') } catch {}

    const fallback = {
      title: hostname,
      artist: null,
      thumbnail_url: null,
      media_id: platform ? extractMediaId(url, platform) : null,
    }

    if (!platform || !OEMBED_ENDPOINTS[platform]) {
      return NextResponse.json(fallback, {
        headers: { 'Cache-Control': 'public, max-age=86400' },
      })
    }

    const oembedUrl = OEMBED_ENDPOINTS[platform](url)

    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(3000),
    })

    if (!res.ok) {
      return NextResponse.json(fallback, {
        headers: { 'Cache-Control': 'public, max-age=86400' },
      })
    }

    const data = await res.json()

    const result = {
      title: data.title || hostname,
      artist: data.author_name || null,
      thumbnail_url: data.thumbnail_url || null,
      media_id: extractMediaId(url, platform),
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    // Timeout or network error — return safe fallback
    let hostname = 'Link'
    try {
      const body = await request.clone().json()
      hostname = new URL(body.url).hostname.replace('www.', '')
    } catch {}

    return NextResponse.json({
      title: hostname,
      artist: null,
      thumbnail_url: null,
      media_id: null,
    }, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    })
  }
}
