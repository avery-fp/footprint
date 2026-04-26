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
 * Verifies the most recent VALID code for (slug, email) — non-consumed,
 * not expired, attempts under the cap. Filtering happens in the SQL so
 * an expired-latest-row can't shadow an older-still-valid one (and so
 * we never pick the wrong row in any future multi-row scenario). On
 * success, sets the fp_edit_{slug} cookie with the footprint's
 * edit_token — same cookie the welcome-email link sets, downstream
 * auth via lib/edit-auth.ts unchanged.
 *
 * Diagnostic logs are intentionally rich (booleans + lengths, no raw
 * code, no edit_token, no email body) so prod failures are debuggable
 * from Vercel logs without redeploying.
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

  // Compact diagnostic. Includes nothing sensitive — email_len + slug
  // only; no raw code, no hash, no token.
  const diag = (extra: Record<string, unknown> = {}) => ({
    route: 'verify',
    slug,
    email_present: !!email,
    email_len: email?.length ?? 0,
    code_len: code?.length ?? 0,
    code_numeric: code ? /^\d+$/.test(code) : false,
    ...extra,
  })

  if (!slug || !email || !code || isDraftSlug(slug)) {
    console.log('[edit-access/verify] reject: bad request shape', diag())
    return fail
  }
  if (!/^\d+$/.test(code) || code.length !== CODE_LENGTH) {
    console.log('[edit-access/verify] reject: code shape', diag())
    return fail
  }

  const db = createServerSupabaseClient()
  const nowIso = new Date().toISOString()

  // Gold path: latest non-consumed, non-expired, under-cap row for this
  // (slug, email). All filters in SQL so an expired latest row can never
  // shadow an older still-valid one.
  const { data: row, error: selErr } = await db
    .from('edit_access_codes')
    .select('id, code_hash, expires_at, attempts')
    .eq('slug', slug)
    .eq('email', email)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (selErr) {
    console.error('[edit-access/verify] DB select error', { ...diag(), code: selErr.code, message: selErr.message })
    return fail
  }

  if (!row) {
    // Nothing valid right now. Do a cheap fallback lookup so the log
    // distinguishes "no code ever requested" from "expired" from
    // "attempts capped" — useful for diagnosing the next failure
    // without leaking anything to the client.
    const { data: anyRow } = await db
      .from('edit_access_codes')
      .select('expires_at, attempts, consumed_at')
      .eq('slug', slug)
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const reason = !anyRow ? 'no_row'
      : anyRow.consumed_at ? 'all_consumed'
      : anyRow.attempts >= MAX_ATTEMPTS ? 'attempts_capped'
      : new Date(anyRow.expires_at).getTime() <= Date.now() ? 'expired'
      : 'unknown'
    console.log('[edit-access/verify] reject: no valid row', diag({ reason }))
    return fail
  }

  const submitted = hashCode(code)
  if (!timingSafeEqualHex(submitted, row.code_hash)) {
    await db
      .from('edit_access_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)
    console.log('[edit-access/verify] reject: hash mismatch', diag({
      row_id_8: row.id?.slice(0, 8),
      attempts_after: row.attempts + 1,
    }))
    return fail
  }

  // Match. Look up the edit_token to set the cookie with.
  const { data: fp, error: fpErr } = await db
    .from('footprints')
    .select('edit_token')
    .eq('username', slug)
    .maybeSingle()
  if (fpErr || !fp?.edit_token) {
    console.error('[edit-access/verify] matched code but footprint missing edit_token', diag({
      footprint_found: !!fp,
      edit_token_present: !!fp?.edit_token,
      err: fpErr?.message,
    }))
    return fail
  }

  await db
    .from('edit_access_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)

  console.log('[edit-access/verify] ok: cookie set', diag({
    row_id_8: row.id?.slice(0, 8),
    cookie_name: editCookieName(slug),
  }))

  const res = NextResponse.json({ ok: true })
  res.cookies.set(editCookieName(slug), fp.edit_token, EDIT_COOKIE_OPTIONS)
  return res
}
