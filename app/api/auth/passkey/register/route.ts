import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { createRegistrationOptions, verifyAndStoreRegistration } from '@/lib/passkeys'
import type { RegistrationResponseJSON } from '@simplewebauthn/types'

/**
 * POST /api/auth/passkey/register
 *
 * Step 1: { action: 'options' } → returns registration options (challenge)
 * Step 2: { action: 'verify', response: <credential>, challenge, deviceName? } → verifies + stores
 *
 * Requires existing session (user must be logged in to add a passkey).
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('fp_session')?.value
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(token)
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'options') {
      const options = await createRegistrationOptions(session.userId, session.email)
      return NextResponse.json(options)
    }

    if (action === 'verify') {
      const { response, challenge, deviceName } = body as {
        response: RegistrationResponseJSON
        challenge: string
        deviceName?: string
      }

      if (!response || !challenge) {
        return NextResponse.json({ error: 'Missing response or challenge' }, { status: 400 })
      }

      await verifyAndStoreRegistration(session.userId, response, challenge, deviceName)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[passkey/register]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
