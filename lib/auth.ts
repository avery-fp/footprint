import { createServerClient } from '@supabase/ssr'
import { SignJWT, jwtVerify } from 'jose'
import { createServerSupabaseClient } from './supabase'
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

export function getSessionCookieDomain(hostname?: string): string | undefined {
  if (!hostname) {
    return process.env.NODE_ENV === 'production' ? '.footprint.onl' : undefined
  }

  return hostname.endsWith('.footprint.onl') || hostname === 'footprint.onl'
    ? '.footprint.onl'
    : undefined
}

/** Shared options so every route sets the cookie identically. */
export function getSessionCookieOptions(hostname?: string) {
  const domain = getSessionCookieDomain(hostname)

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    ...(domain ? { domain } : {}),
  }
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
 * Get user from session token
 *
 * Convenience function that verifies token and fetches full user data.
 */
export async function getUserFromSession(token: string) {
  const session = await verifySessionToken(token)

  if (!session) {
    return null
  }

  const supabase = createServerSupabaseClient()

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.userId)
    .single()

  return user
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
  const loginUrl = `${baseUrl}/login`

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Welcome email for ${email} (FP #${serialNumber}): ${loginUrl}`)
    return true
  }

  try {
    await sendEmail({
      from: 'Footprint <hello@footprint.onl>',
      to: email,
      subject: `Welcome — you're FP #${serialNumber}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
          <p style="font-size: 28px; font-weight: 300; margin-bottom: 8px;">
            You're FP #${serialNumber.toLocaleString()}
          </p>
          <p style="color: #666; font-size: 15px; line-height: 1.6;">
            Your footprint is live. Sign in to start posting.
          </p>
          <a href="${loginUrl}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; margin: 20px 0;">
            Sign in &amp; start posting
          </a>
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
  const token = request.cookies.get('fp_session')?.value
  if (token) {
    const session = await verifySessionToken(token)
    if (session?.userId) return session.userId
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set() {},
        remove() {},
      },
    })

    const { data, error } = await supabase.auth.getUser()
    if (error) {
      console.error('[auth] Supabase session lookup failed:', error.message)
      return null
    }

    return data.user?.id ?? null
  } catch (err) {
    console.error('[auth] Supabase session lookup failed:', err instanceof Error ? err.message : err)
    return null
  }
}
