import { NextRequest, NextResponse } from 'next/server'
import { fetchGrailedFavorites } from '@/lib/grailed-favorites'
import { validateFetchUrl } from '@/lib/ssrf'

export const dynamic = 'force-dynamic'

/**
 * GET /api/grailed-favorites?url=...
 *
 * Pulls a Grailed favorites/list/user page and returns extracted listing
 * objects. If extraction yields zero listings, callers fall back to the
 * sealed preview card.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  const check = validateFetchUrl(url)
  if (!check.valid) {
    return NextResponse.json({ error: check.error }, { status: 400 })
  }
  if (!/grailed\.com$/i.test(check.parsed!.hostname.replace(/^www\./, ''))) {
    return NextResponse.json({ error: 'Not a Grailed URL' }, { status: 400 })
  }

  const result = await fetchGrailedFavorites(url)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
  })
}
