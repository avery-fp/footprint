import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase'
import { editCookieName, EDIT_COOKIE_OPTIONS } from '@/lib/edit-auth'

/**
 * GET /api/edit-access/owner-unlock?slug=ae&secret=...
 *
 * TEMPORARY env-gated unlock for slug "ae" only, so ae can reach the editor
 * even if email delivery breaks. Sets fp_edit_ae cookie and 302s back to
 * /ae/home with the secret stripped.
 *
 * TODO remove after the email-code flow has been verified live.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('slug')
  const secret = url.searchParams.get('secret')

  if (slug !== 'ae') return NextResponse.json({ ok: false }, { status: 404 })
  const expected = process.env.FP_OWNER_UNLOCK_SECRET
  if (!expected || !secret) return NextResponse.json({ ok: false }, { status: 404 })

  const a = Buffer.from(secret)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const db = createServerSupabaseClient()
  const { data } = await db
    .from('footprints')
    .select('edit_token')
    .eq('username', slug)
    .maybeSingle()
  if (!data?.edit_token) return NextResponse.json({ ok: false }, { status: 404 })

  const dest = new URL(`/${slug}/home`, request.url)
  const res = NextResponse.redirect(dest, 302)
  res.cookies.set(editCookieName(slug), data.edit_token, EDIT_COOKIE_OPTIONS)
  return res
}
