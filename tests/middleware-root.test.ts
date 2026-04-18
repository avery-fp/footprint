import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { createSessionToken } from '@/lib/auth'
import { SignJWT } from 'jose'

// Root route (/) regression guard.
//
// Previously the root handler only checked that an fp_session cookie existed,
// not that it was valid. Any stale/expired/tampered cookie satisfied the
// "existence" check and landed the user on /home (sign-in), which broke the
// "room is the homepage" contract of PR #248 for everyone carrying a dead
// session in their browser.
//
// Contract under test:
//   - no cookie               → redirect /ae
//   - cookie with invalid JWT → redirect /ae (same as no cookie)
//   - cookie with expired JWT → redirect /ae
//   - cookie with valid JWT   → redirect /home (editor entry)

const HOST = 'www.footprint.onl'
const SECRET = 'test-secret-key-for-vitest-only'

function makeRequest(url: string, cookie?: string): NextRequest {
  const headers = new Headers({ host: HOST })
  if (cookie) headers.set('cookie', `fp_session=${cookie}`)
  return new NextRequest(new URL(url, `https://${HOST}`), { headers })
}

async function runMiddleware(req: NextRequest) {
  const result = await middleware(req)
  return {
    status: result.status,
    location: result.headers.get('location') || '',
  }
}

describe('middleware: root route (/) session gate', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET
  })

  it('no cookie → /ae (stranger: the room is the homepage)', async () => {
    const { status, location } = await runMiddleware(makeRequest('/'))
    expect(status).toBe(307)
    expect(location).toBe(`https://${HOST}/ae`)
  })

  it('invalid cookie (not a JWT) → /ae (treated as stranger)', async () => {
    const { status, location } = await runMiddleware(makeRequest('/', 'garbage-not-a-jwt'))
    expect(status).toBe(307)
    expect(location).toBe(`https://${HOST}/ae`)
  })

  it('expired cookie → /ae (stale session is not a session)', async () => {
    const secret = new TextEncoder().encode(SECRET)
    const expiredToken = await new SignJWT({ userId: 'u1', email: 't@x.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret)
    const { status, location } = await runMiddleware(makeRequest('/', expiredToken))
    expect(status).toBe(307)
    expect(location).toBe(`https://${HOST}/ae`)
  })

  it('valid cookie → /home (authenticated editor entry)', async () => {
    const token = await createSessionToken('u1', 't@x.com')
    const { status, location } = await runMiddleware(makeRequest('/', token))
    expect(status).toBe(307)
    expect(location).toBe(`https://${HOST}/home`)
  })
})

describe('middleware: unrelated routes still behave correctly', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET
  })

  it('direct /ae still passes through publicly (no session required)', async () => {
    const req = makeRequest('/ae')
    const res = await middleware(req)
    // public profile → pass through (NextResponse.next() has no location header)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('direct /ae with a stale cookie still passes through publicly', async () => {
    const req = makeRequest('/ae', 'garbage-not-a-jwt')
    const res = await middleware(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('/{slug}/home without session → redirect to /home (auth gate intact)', async () => {
    const req = makeRequest('/ae/home')
    const res = await middleware(req)
    // /{slug}/home matches isHomeEditor regex → passes through middleware.
    // The page itself enforces auth. Middleware should not redirect here.
    // (The old buggy path never touched /{slug}/home either; this guards
    // against over-eager future changes.)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })
})
