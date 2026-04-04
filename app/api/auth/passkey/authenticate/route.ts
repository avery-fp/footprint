import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { createAuthenticationOptions, verifyAuthentication } from '@/lib/passkeys'
import type { AuthenticationResponseJSON } from '@simplewebauthn/types'

/**
 * POST /api/auth/passkey/authenticate
 *
 * Step 1: { action: 'options', email? } → returns authentication options (challenge)
 * Step 2: { action: 'verify', response: <assertion>, challenge } → verifies + creates session
 *
 * No session required — this IS the login flow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'options') {
      const options = await createAuthenticationOptions(body.email)
      return NextResponse.json(options)
    }

    if (action === 'verify') {
      const { response, challenge } = body as {
        response: AuthenticationResponseJSON
        challenge: string
      }

      if (!response || !challenge) {
        return NextResponse.json({ error: 'Missing response or challenge' }, { status: 400 })
      }

      const result = await verifyAuthentication(response, challenge)
      if (!result) {
        return NextResponse.json({ error: 'Passkey verification failed' }, { status: 401 })
      }

      // Create session
      const sessionToken = await createSessionToken(result.userId, result.email)

      const res = NextResponse.json({ success: true })
      res.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)
      return res
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[passkey/authenticate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
