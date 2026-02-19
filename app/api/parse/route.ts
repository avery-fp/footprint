import { NextRequest, NextResponse } from 'next/server'
import { parseURL } from '@/lib/parser'

/**
 * POST /api/parse
 *
 * Takes a URL and returns parsed metadata (title, thumbnail, embed, etc).
 * Public endpoint — used during draft creation before auth exists.
 *
 * Saving is handled by /api/tiles POST (which requires auth + ownership).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const parsed = await parseURL(url)

    return NextResponse.json({ parsed })
  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json({ error: 'Failed to parse URL' }, { status: 500 })
  }
}
