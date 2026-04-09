import { SignJWT, jwtVerify } from 'jose'
import { createServerSupabaseClient } from './supabase'
import { AUTH_ENTRY } from './routes'
import { createRouteHandlerSupabaseAuthClient } from './supabase-auth-ssr'
import type { NextRequest } from 'next/server'

// Secret key for JWT signing — MUST be set via JWT_SECRET env var in production
function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set')
  }
  return new TextEncoder().encode(secret || 'dev-only-unsafe-key-do-not-use-in-prod')
}

// Lazy-init: deferred so the build step doesn't throw at module load time
let _jwtSecret: Uint8Array | null = null
function JWT_SECRET_KEY() {
  if (!_jwtSecret) _jwtSecret = getJwtSecret()
  return _jwtSecret
}

const SESSION_EXPIRY = '30d'     // Session valid for 30 days

/** Shared cookie name for the session identifier. */
export const SESSION_COOKIE_NAME = 'fp_session'

/** Shared options so every route sets the cookie identically. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
  domain: process.env.NODE_ENV === 'production' ? '.footprint.onl' : undefined,
}

/**
 * Create a JWT session token
 *
 * This token is stored in a cookie and used to authenticate requests.
 * Contains the user ID and email, signed with our secret.
 */
export async function createSessionToken(userId: string, email: string): Promise<string> {
  const token = await new SignJWT({
    userId,
    email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(JWT_SECRET_KEY())

  return token
}

/**
 * Verify a session token and return the payload
 *
 * Used in middleware and API routes to check authentication.
 */
export async function verifySessionToken(token: string): Promise<{
  userId: string
  email: string
} | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY())

    // Validate payload shape to prevent crashes from malformed JWTs
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
      return null
    }

    return {
      userId: payload.userId,
      email: payload.email,
    }
  } catch (err) {
    console.error('[auth] JWT verify failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Send an email via Resend's REST API (no SDK needed)
 */
async function sendEmail(params: { from: string; to: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API error (${res.status}): ${body}`)
  }

  return res.json()
}

/**
 * Send welcome email after purchase
 */
export async function sendWelcomeEmail(email: string, serialNumber: number, username?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'
  const loginUrl = `${baseUrl}${AUTH_ENTRY}`

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Welcome email for ${email} (FP #${serialNumber}): ${loginUrl}`)
    return true
  }

  try {
    await sendEmail({
      from: 'Footprint <hello@footprint.onl>',
      to: email,
      subject: `you're FP #${serialNumber}`,
      html: `
        <div style="background-color: #0c0c10; width: 100%; min-height: 100%; margin: 0; padding: 0;">
          <div style="max-width: 600px; margin: 0 auto; padding: 72px 32px 60px 32px; text-align: center;">
            <p style="margin: 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.6; font-weight: 300; color: #555560; letter-spacing: 0.04em; text-transform: lowercase;">
              welcome
            </p>
            <p style="margin: 40px 0 0 0; font-family: 'DM Mono', 'Courier New', monospace; font-size: 21px; line-height: 1.55; font-weight: 300; color: #d4c5a9; letter-spacing: 0.01em;">
              you're FP #${serialNumber.toLocaleString()}
            </p>
            <p style="margin: 20px 16px 0 16px; font-family: 'DM Mono', 'Courier New', monospace; font-size: 13px; line-height: 1.8; font-weight: 300; color: #777780; letter-spacing: 0.02em;">
              your footprint is live.<br>
              sign in to start posting.
            </p>
            <div style="margin: 48px 0 0 0;">
              <a href="${loginUrl}" style="display: inline-block; padding: 14px 36px; background-color: #d4c5a9; color: #0c0c10; font-family: 'DM Mono', 'Courier New', monospace; font-size: 14px; font-weight: 500; text-decoration: none; letter-spacing: 0.04em; border-radius: 3px;">
                sign in & start posting
              </a>
            </div>
            <div style="margin: 80px 0 0 0; border-top: 1px solid #1e1e24; padding-top: 24px;">
              <a href="https://footprint.onl" style="font-family: 'DM Mono', 'Courier New', monospace; font-size: 12px; color: #555560; text-decoration: none; letter-spacing: 0.06em;">footprint.onl</a>
            </div>
          </div>
        </div>
      `,
    })
  } catch (err) {
    console.error('Welcome email failed:', err)
  }

  return true
}

/**
 * Extract userId from fp_session cookie on an incoming request.
 * Returns null if cookie is missing or JWT is invalid/expired.
 */
export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  async function resolveInternalUserIdByEmail(email: string): Promise<string | null> {
    const normalizedEmail = email.toLowerCase().trim()
    if (!normalizedEmail) return null

    const db = createServerSupabaseClient()
    const { data: user, error: userError } = await db
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .single()

    if (userError) {
      console.error('[auth] Internal user lookup failed:', userError.message)
      return null
    }

    return user?.id ?? null
  }

  const token = request.cookies.get('fp_session')?.value
  if (token) {
    const session = await verifySessionToken(token)
    if (session?.email) {
      const canonicalUserId = await resolveInternalUserIdByEmail(session.email)
      if (canonicalUserId) return canonicalUserId
    }
    if (!session?.email && session?.userId) return session.userId
  }

  try {
    const { supabase } = createRouteHandlerSupabaseAuthClient(request)
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      console.error('[auth] Supabase session lookup failed:', error.message)
      return null
    }

    const email = data.user?.email?.toLowerCase().trim()
    if (!email) return null
    return await resolveInternalUserIdByEmail(email)
  } catch (err) {
    console.error('[auth] Supabase session lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}
