import { NextRequest, NextResponse } from 'next/server'

/**
 * Verify ARO API key from the Authorization header.
 *
 * Accepts: Authorization: Bearer <aro_key>
 *
 * Also accepts aro_key in query string or request body for backwards
 * compatibility, but callers should migrate to the header.
 *
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function verifyAroKey(request: NextRequest, bodyKey?: string): NextResponse | null {
  const authHeader = request.headers.get('authorization')

  // Prefer Authorization header
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (token && token === process.env.ARO_KEY) return null
    return NextResponse.json({ error: 'Invalid authorization' }, { status: 401 })
  }

  // Fallback: query string
  const queryKey = request.nextUrl.searchParams.get('aro_key')
  if (queryKey) {
    if (queryKey === process.env.ARO_KEY) return null
    return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
  }

  // Fallback: request body (already parsed by caller)
  if (bodyKey) {
    if (bodyKey === process.env.ARO_KEY) return null
    return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
  }

  return NextResponse.json({ error: 'Authorization required' }, { status: 401 })
}
