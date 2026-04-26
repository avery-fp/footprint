import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/auth'
import { isDraftSlug } from '@/lib/edit-auth'
import {
  generateCode,
  hashCode,
  ownerEmailForSlug,
  sendEditAccessCodeEmail,
  CODE_TTL_MS,
} from '@/lib/edit-access-codes'

/**
 * POST /api/edit-access/start
 *
 * Body: { slug, email }
 *
 * If {email} owns {slug}, store a hashed 6-digit code and email it. Always
 * returns the same generic success — never leaks ownership.
 *
 * Rate-limited per (slug, email) at 3 codes per 10 minutes via DB lookback.
 */
export async function POST(request: NextRequest) {
  const generic = NextResponse.json({
    ok: true,
    message: 'If this email owns this Footprint, we sent a code.',
  })

  let slug: string | null = null
  let email: string | null = null
  try {
    const body = await request.json()
    slug = typeof body?.slug === 'string' ? body.slug.toLowerCase().trim() : null
    const rawEmail = typeof body?.email === 'string' ? body.email : null
    email = rawEmail ? normalizeEmail(rawEmail) : null
  } catch {
    return generic
  }

  if (!slug || !email || isDraftSlug(slug)) return generic
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic

  const owner = await ownerEmailForSlug(slug)
  if (!owner || owner !== email) {
    // Don't leak ownership through timing — but doing a DB write only on
    // match is acceptable for this product.
    return generic
  }

  const db = createServerSupabaseClient()

  // Soft rate limit: 3 codes per 10 minutes per (slug, email).
  const since = new Date(Date.now() - CODE_TTL_MS).toISOString()
  const { count: recentCount } = await db
    .from('edit_access_codes')
    .select('id', { count: 'exact', head: true })
    .eq('slug', slug)
    .eq('email', email)
    .gt('created_at', since)
  if ((recentCount ?? 0) >= 3) return generic

  const code = generateCode()
  const code_hash = hashCode(code)
  const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString()

  const { error: insertErr } = await db.from('edit_access_codes').insert({
    slug,
    email,
    code_hash,
    expires_at,
  })
  if (insertErr) {
    console.error('[edit-access/start] insert failed', { slug, code: insertErr.code, message: insertErr.message })
    return generic
  }

  try {
    await sendEditAccessCodeEmail(email, slug, code)
  } catch (err) {
    console.error('[edit-access/start] email send failed', { slug, err: (err as Error)?.message })
  }

  return generic
}
