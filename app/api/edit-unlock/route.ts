import { NextRequest, NextResponse } from 'next/server'
import { verifyEditToken, editCookieName, EDIT_COOKIE_OPTIONS } from '@/lib/edit-auth'

/**
 * POST /api/edit-unlock
 *
 * Body: { slug, token }
 *
 * Verifies the token matches the footprint's edit_token and sets the
 * httpOnly fp_edit_{slug} cookie. Used by the post-payment claim page
 * once it has received the edit_token, and by the editor page on first
 * arrival with ?token= in the URL.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const slug = typeof body?.slug === 'string' ? body.slug : null
    const token = typeof body?.token === 'string' ? body.token : null

    if (!slug || !token) {
      return NextResponse.json({ ok: false, error: 'slug and token required' }, { status: 400 })
    }

    const auth = await verifyEditToken(slug, token)
    if (!auth.ok) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(editCookieName(slug), token, EDIT_COOKIE_OPTIONS)
    return res
  } catch (err) {
    console.error('edit-unlock failed:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
