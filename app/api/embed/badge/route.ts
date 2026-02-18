import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/embed/badge?slug=xxx
 *
 * Returns a JS snippet that renders a small Footprint badge on external sites.
 * Users embed <script src="/api/embed/badge?slug=ae"></script> anywhere.
 *
 * Params:
 *   slug - footprint slug (required)
 *   style - 'dark' (default) | 'light' | 'minimal'
 *   format - 'js' (default) | 'html'
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  const style = searchParams.get('style') || 'dark'

  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

  let fp = null
  const { data: bySlug } = await supabase
    .from('footprints')
    .select('display_name, user_id')
    .or(`slug.eq.${slug},username.eq.${slug}`)
    .single()

  if (bySlug) fp = bySlug

  let serial = 0
  if (fp) {
    const { data: user } = await supabase
      .from('users')
      .select('serial_number')
      .eq('id', fp.user_id)
      .single()
    serial = user?.serial_number || 0
  }

  const name = fp?.display_name || slug
  const link = `${baseUrl}/${slug}?ref=FP-${serial}`

  const colors = style === 'light'
    ? { bg: '#FFFFFF', text: '#111111', border: '#E5E5E5', muted: '#888888' }
    : style === 'minimal'
    ? { bg: 'transparent', text: 'inherit', border: 'transparent', muted: 'inherit' }
    : { bg: '#111111', text: '#F5F5F5', border: '#222222', muted: '#666666' }

  const html = `<a href="${link}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;text-decoration:none;background:${colors.bg};color:${colors.text};border:1px solid ${colors.border};font-family:system-ui,-apple-system,sans-serif;font-size:13px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg><span>${name}</span><span style="color:${colors.muted};font-size:11px;font-family:monospace;">#${String(serial).padStart(4,'0')}</span></a>`

  const js = `(function(){var c=document.currentScript.parentElement;c.innerHTML=${JSON.stringify(html)};})();`

  const format = searchParams.get('format')
  if (format === 'html') {
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
    })
  }

  return new NextResponse(js, {
    headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' },
  })
}
