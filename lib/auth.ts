import { SignJWT, jwtVerify } from 'jose'
import { createServerSupabaseClient } from './supabase'
import { nanoid } from 'nanoid'

// Secret key for JWT signing (use env var in production)
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-chars-long!'
)

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
export async function generateMagicLink(email: string): Promise<string> {
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

  // Build the magic link URL - hardcoded to production URL
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://www.footprint.onl'
    : 'http://localhost:3000'
  return `${baseUrl}/auth/verify?token=${token}`
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
  
  // Find the magic link
  const { data: magicLink, error } = await supabase
    .from('magic_links')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .single()

  if (error || !magicLink) {
    return null
  }

  // Check if expired
  if (new Date(magicLink.expires_at) < new Date()) {
    return null
  }

  // Mark the magic link as used
  await supabase
    .from('magic_links')
    .update({ used_at: new Date().toISOString() })
    .eq('id', magicLink.id)

  // Get or create the user
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', magicLink.email)
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
    .sign(JWT_SECRET)

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
    const { payload } = await jwtVerify(token, JWT_SECRET)
    
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
 * Send magic link email
 * 
 * In production, use Resend, SendGrid, or similar.
 * For now, just console log it.
 */
export async function sendMagicLinkEmail(email: string, magicLink: string) {
  // TODO: Integrate with email service
  // For now, log to console (useful for development)
  console.log(`
    ═══════════════════════════════════════════════
    MAGIC LINK FOR: ${email}
    ${magicLink}
    ═══════════════════════════════════════════════
  `)
  
  // In production:
  // await resend.emails.send({
  //   from: 'Footprint <noreply@footprint.link>',
  //   to: email,
  //   subject: 'Your login link',
  //   html: `<a href="${magicLink}">Click to sign in</a>`,
  // })
  
  return true
}
