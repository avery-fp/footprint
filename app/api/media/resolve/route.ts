import { NextRequest, NextResponse } from 'next/server'
import { identifyMedia } from '@/lib/media/identify'

/**
 * POST /api/media/resolve
 *
 * Preview-before-save endpoint. Takes a URL, returns an IdentifiedMedia object.
 * No auth required — enables client-side preview while typing.
 *
 * Input:  { "url": "https://..." }
 * Output: IdentifiedMedia
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const url = body?.url

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid url field' },
        { status: 400 }
      )
    }

    // Block non-HTTP(S) protocols (SSRF protection)
    let normalized = url.trim()
    if (!normalized.startsWith('http')) normalized = 'https://' + normalized
    try {
      const parsed = new URL(normalized)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return NextResponse.json(
          { error: 'Only HTTP(S) URLs are supported' },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400 }
      )
    }

    const result = await identifyMedia(normalized)

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to resolve media' },
      { status: 500 }
    )
  }
}
