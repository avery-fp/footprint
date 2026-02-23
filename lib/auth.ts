import { SignJWT, jwtVerify } from 'jose'
import { createServerSupabaseClient } from './supabase'
import { nanoid } from 'nanoid'
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

// Token expiration times
const MAGIC_LINK_EXPIRY = '15m'  // Magic link valid for 15 minutes
const SESSION_EXPIRY = '30d'     // Session valid for 30 days

/**
 * Generate a magic link token for passwordless auth
 * 
 * The flow:
 * 1. User enters email
 * 2. We generate a secure token
 * 3. Send email with link containing token
 * 4. User clicks link, we verify token, create session
 * 
 * Simple. Secure. No passwords to remember.
 */
export async function generateMagicLink(email: string, redirect?: string): Promise<string> {
  const supabase = createServerSupabaseClient()

  // Generate a unique token
  const token = nanoid(32)

  // Calculate expiry time (15 minutes from now)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  // Store the magic link in the database
  const { error } = await supabase
    .from('magic_links')
    .insert({
      email,
      token,
      expires_at: expiresAt.toISOString(),
    })

  if (error) {
    console.error('Magic link DB insert error:', error)
    throw new Error(`Failed to create magic link: ${error.message}`)
  }

  // Build the magic link URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = `${baseUrl}/auth/verify?token=${token}`
  return redirect ? `${url}&redirect=${encodeURIComponent(redirect)}` : url
}

/**
 * Verify a magic link token and create a session
 * 
 * Returns the user data and a session token if valid.
 * Returns null if invalid or expired.
 */
export async function verifyMagicLink(token: string): Promise<{
  user: any
  sessionToken: string
} | null> {
  const supabase = createServerSupabaseClient()

  // Atomically consume the token: UPDATE where used_at IS NULL
  // If two requests race, only one will succeed (the other gets 0 rows)
  const { data: consumed, error: consumeError } = await supabase
    .from('magic_links')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .gte('expires_at', new Date().toISOString())
    .select('email')
    .single()

  if (consumeError || !consumed) {
    return null
  }

  // Get the user
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', consumed.email)
    .single()

  // If no user exists, they haven't paid yet
  if (!user) {
    return null
  }

  // Create a session token
  const sessionToken = await createSessionToken(user.id, user.email)

  return { user, sessionToken }
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
    
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    }
  } catch {
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
 * Send magic link email via Resend
 *
 * Requires RESEND_API_KEY env var.
 * Falls back to console.log in development if no key is set.
 */
export async function sendMagicLinkEmail(email: string, magicLink: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Magic link for ${email}: ${magicLink}`)
    return true
  }

  await sendEmail({
    from: 'Footprint <login@footprint.onl>',
    to: email,
    subject: 'Your Footprint login link',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <p style="color: #666; font-size: 15px; line-height: 1.6;">
          Tap below to sign in to your Footprint.
        </p>
        <a href="${magicLink}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; margin: 20px 0;">
          Sign in
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          This link expires in 15 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
  })

  return true
}

/**
 * Send welcome email with magic link after purchase
 */
export async function sendWelcomeEmail(email: string, serialNumber: number, username?: string) {
  const redirect = username ? `/${username}/home` : '/build'
  const magicLink = await generateMagicLink(email, redirect)

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Welcome email for ${email} (FP #${serialNumber}): ${magicLink}`)
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
            Your footprint is live. Tap below to sign in and start posting.
          </p>
          <a href="${magicLink}" style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; margin: 20px 0;">
            Sign in &amp; start posting
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This link expires in 15 minutes. You can always request a new one at footprint.onl.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('Welcome email failed:', err)
    // Don't throw — user is already created, they can request a magic link manually
  }

  return true
}

/**
 * Extract userId from fp_session cookie on an incoming request.
 * Returns null if cookie is missing or JWT is invalid/expired.
 */
export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('fp_session')?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  return session?.userId ?? null
}
