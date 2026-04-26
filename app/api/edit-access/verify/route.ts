import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/auth'
import { editCookieName, EDIT_COOKIE_OPTIONS, isDraftSlug } from '@/lib/edit-auth'
import { hashCode, timingSafeEqualHex, MAX_ATTEMPTS, CODE_LENGTH } from '@/lib/edit-access-codes'

/**
 * POST /api/edit-access/verify
 *
 * Body: { slug, email, code }
 *
 * Verifies the most recent unconsumed code for (slug, email). On success,
 * sets the fp_edit_{slug} cookie to the footprint's edit_token — the same
 * cookie the welcome-email link sets, so downstream auth is unchanged.
 */
export async function POST(request: NextRequest) {
  const fail = NextResponse.json({ ok: false, error: 'invalid_or_expired' }, { status: 400 })

  let slug: string | null = null
  let email: string | null = null
  let code: string | null = null
  try {
    const body = await request.json()
    slug = typeof body?.slug === 'string' ? body.slug.toLowerCase().trim() : null
    const rawEmail = typeof body?.email === 'string' ? body.email : null
    email = rawEmail ? normalizeEmail(rawEmail) : null
    code = typeof body?.code === 'string' ? body.code.trim() : null
  } catch {
    return fail
  }

  if (!slug || !email || !code || isDraftSlug(slug)) return fail
  if (!/^\d+$/.test(code) || code.length !== CODE_LENGTH) return fail

  const db = createServerSupabaseClient()

  const { data: row } = await db
    .from('edit_access_codes')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('slug', slug)
    .eq('email', email)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return fail
  if (row.attempts >= MAX_ATTEMPTS) return fail
  if (new Date(row.expires_at).getTime() < Date.now()) return fail

  const submitted = hashCode(code)
  if (!timingSafeEqualHex(submitted, row.code_hash)) {
    await db
      .from('edit_access_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)
    return fail
  }

  // Match. Look up the edit_token to set the cookie with.
  const { data: fp } = await db
    .from('footprints')
    .select('edit_token')
    .eq('username', slug)
    .maybeSingle()
  if (!fp?.edit_token) {
    console.error('[edit-access/verify] matched code but footprint has no edit_token', { slug })
    return fail
  }

  await db
    .from('edit_access_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(editCookieName(slug), fp.edit_token, EDIT_COOKIE_OPTIONS)
  return res
}
