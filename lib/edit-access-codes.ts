import crypto from 'crypto'
import { createServerSupabaseClient } from './supabase'
import { normalizeEmail } from './auth'

/**
 * Same-page email-code login for the editor.
 *
 * Constitutional law (see lib/edit-auth.ts): every editor authorization must
 * trace to a Stripe-verified email or to the edit_token issued for it. This
 * module is the on-ramp for the email side: prove ownership of the Stripe
 * email, get the edit_token cookie, edit. No magic links, no Supabase auth.
 */

export const CODE_TTL_MS = 10 * 60 * 1000   // 10 minutes
export const MAX_ATTEMPTS = 5
export const CODE_LENGTH = 6

/** 6-digit numeric code, zero-padded. Cryptographically uniform. */
export function generateCode(): string {
  // 1_000_000 possible codes; rejection-sample to keep uniform.
  const max = 10 ** CODE_LENGTH
  let n: number
  do {
    n = crypto.randomBytes(4).readUInt32BE(0)
  } while (n >= Math.floor(0xffffffff / max) * max)
  return String(n % max).padStart(CODE_LENGTH, '0')
}

/**
 * HMAC the code with a server-side pepper so a DB leak doesn't trivially
 * rainbow-table all 10^6 codes. Reuses SUPABASE_SERVICE_ROLE_KEY since it's
 * already a required secret — no new env var to forget.
 */
export function hashCode(code: string): string {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-pepper'
  return crypto.createHmac('sha256', pepper).update(code).digest('hex')
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

/**
 * Look up the owner email for {slug}. Returns null if the slug doesn't
 * exist, is a draft, or has no claimed owner yet.
 */
export async function ownerEmailForSlug(slug: string): Promise<string | null> {
  const db = createServerSupabaseClient()
  const { data: fp } = await db
    .from('footprints')
    .select('user_id, edit_token')
    .eq('username', slug)
    .maybeSingle()

  if (!fp || !fp.user_id || !fp.edit_token) return null

  const { data: user } = await db
    .from('users')
    .select('email')
    .eq('id', fp.user_id)
    .maybeSingle()

  return user?.email ? normalizeEmail(user.email) : null
}

/** Send a transactional code email via Resend. */
export async function sendEditAccessCodeEmail(email: string, slug: string, code: string) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] edit-access code for ${email} (${slug}): ${code}`)
    }
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Footprint <hello@footprint.onl>',
      to: email,
      subject: `your editor code: ${code}`,
      html: `
        <div style="background-color: #0c0c10; width: 100%; min-height: 100%; margin: 0; padding: 0;">
          <div style="max-width: 520px; margin: 0 auto; padding: 72px 32px 60px 32px; text-align: center;">
            <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.6; font-weight: 300; color: #555560; letter-spacing: 0.04em; text-transform: lowercase;">
              editor access
            </p>
            <p style="margin: 40px 0 0 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.7; font-weight: 300; color: #777780; letter-spacing: 0.02em;">
              enter this code on footprint.onl/${slug}/home
            </p>
            <p style="margin: 28px 0 0 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 36px; line-height: 1.1; font-weight: 400; color: #d4c5a9; letter-spacing: 0.32em;">
              ${code}
            </p>
            <p style="margin: 36px 16px 0 16px; font-family: 'DM Mono', 'Courier New', monospace; font-size: 11px; line-height: 1.7; font-weight: 300; color: #555560; letter-spacing: 0.02em;">
              expires in 10 minutes. if you didn't request this, ignore this email.
            </p>
          </div>
        </div>
      `,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }
}
