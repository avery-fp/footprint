import { SignJWT, jwtVerify } from 'jose'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production')
}

const SESSION_EXPIRY = '30d'

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

let _jwtSecret: Uint8Array | null = null
function getSecret(): Uint8Array {
  if (_jwtSecret) return _jwtSecret
  const secret = JWT_SECRET || 'dev-secret-change-me'
  _jwtSecret = new TextEncoder().encode(secret)
  return _jwtSecret
}

export async function createSessionToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return { userId: payload.userId as string, email: payload.email as string }
  } catch (err) {
    console.error('[auth] JWT verify failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/fp_session=([^;]+)/)
  if (!match) return null

  const session = await verifySessionToken(match[1])
  return session?.userId || null
}
