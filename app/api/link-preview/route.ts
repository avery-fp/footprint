import { NextRequest, NextResponse } from 'next/server'
import { fetchLinkPreview } from '@/lib/og'
import { validateFetchUrl } from '@/lib/ssrf'

export const dynamic = 'force-dynamic'

/**
 * GET /api/link-preview?url=...
 *
 * The shared Footprint ingestion primitive: fetches any URL, extracts
 * og:title / og:description / og:image / canonical, returns a normalized
 * preview shape. SSRF-guarded, hostname-validated, time-bounded.
 *
 * Returns 200 with all-null fields when extraction yields nothing — never
 * throws to the caller. Use this anywhere the UI needs a "useful preview"
 * for a pasted URL without provider-specific code.
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

  const preview = await fetchLinkPreview(url)
  if (!preview) {
    return NextResponse.json(
      {
        url,
        canonical: null,
        title: null,
        description: null,
        image: null,
        siteName: null,
        type: null,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } }
    )
  }

  return NextResponse.json(preview, {
    headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
  })
}
