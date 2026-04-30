import { createHmac, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'

export const OWNER_SESSION_COOKIE = 'fp_owner_session'
export const OWNER_KEY_RE = /^\d{6,8}$/
export const OWNER_SESSION_MAX_AGE = 60 * 60 * 24 * 30

type OwnerSessionPayload = {
  slug: string
  serial: number
  exp: number
}

export type OwnerIdentifier =
  | { kind: 'slug'; slug: string }
  | { kind: 'serial'; serial: number }

export function normalizeOwnerIdentifier(input: unknown): OwnerIdentifier | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null

  if (raw.startsWith('#')) {
    const serial = raw.slice(1).replace(/\D/g, '')
    if (!serial) return null
    return { kind: 'serial', serial: Number(serial) }
  }

  if (/^\d+$/.test(raw)) {
    return { kind: 'serial', serial: Number(raw) }
  }

  const slug = raw.replace(/^@/, '').toLowerCase()
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null
  return { kind: 'slug', slug }
}

export async function hashOwnerKey(ownerKey: string): Promise<string> {
  return bcrypt.hash(ownerKey, 12)
}

export async function verifyOwnerKey(ownerKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(ownerKey, hash)
}

function ownerSessionSecret(): string {
  return (
    process.env.OWNER_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    'dev-owner-session-secret'
  )
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', ownerSessionSecret()).update(encodedPayload).digest('base64url')
}

export function createOwnerSession(slug: string, serial: number): string {
  const payload: OwnerSessionPayload = {
    slug,
    serial,
    exp: Math.floor(Date.now() / 1000) + OWNER_SESSION_MAX_AGE,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signPayload(encoded)}`
}

function readCookie(request: NextRequest | Request, name: string): string | null {
  const asNext = request as NextRequest
  const fromJar = asNext.cookies?.get?.(name)?.value ?? null
  if (fromJar) return fromJar

  const raw = request.headers.get('cookie') || ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function verifyOwnerSession(request: NextRequest | Request, slug: string): OwnerSessionPayload | null {
  const value = readCookie(request, OWNER_SESSION_COOKIE)
  if (!value) return null

  const [encoded, signature] = value.split('.')
  if (!encoded || !signature) return null

  const expected = signPayload(encoded)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OwnerSessionPayload
    if (payload.slug !== slug) return null
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function ownerSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: OWNER_SESSION_MAX_AGE,
  }
}
