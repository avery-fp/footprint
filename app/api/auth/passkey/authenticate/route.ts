import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

const RP_ID = process.env.PASSKEY_RP_ID || 'footprint.onl'
const RP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'

// In-memory challenge store (short-lived, keyed by random session ID)
// Production should use Redis or similar
const challengeStore = new Map<string, { challenge: string; expires: number }>()

function cleanExpired() {
  const now = Date.now()
  challengeStore.forEach((v, k) => {
    if (v.expires < now) challengeStore.delete(k)
  })
}

/**
 * POST /api/auth/passkey/authenticate
 *
 * Two-phase passkey authentication:
 * 1. action: "options" → returns WebAuthn options + session ID
 * 2. action: "verify"  → verifies credential, returns JWT session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body?.action

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (action === 'options') {
      cleanExpired()

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: 'preferred',
        // Empty allowCredentials = discoverable credential (resident key)
      })

      // Store challenge
      const sessionId = crypto.randomUUID()
      challengeStore.set(sessionId, {
        challenge: options.challenge,
        expires: Date.now() + 5 * 60 * 1000, // 5 min
      })

      return NextResponse.json({ ...options, sessionId })
    }

    if (action === 'verify') {
      const { credential, sessionId } = body
      if (!credential || !sessionId) {
        return NextResponse.json({ error: 'Missing credential or session' }, { status: 400 })
      }

      const stored = challengeStore.get(sessionId)
      if (!stored || stored.expires < Date.now()) {
        challengeStore.delete(sessionId)
        return NextResponse.json({ error: 'Challenge expired' }, { status: 400 })
      }
      challengeStore.delete(sessionId)

      // Find the credential in our DB
      const credentialId = credential.id
      const { data: storedCred } = await supabase
        .from('passkey_credentials')
        .select('*, users!inner(id, email)')
        .eq('credential_id', credentialId)
        .single()

      if (!storedCred) {
        return NextResponse.json({ error: 'Passkey not recognized' }, { status: 401 })
      }

      // Verify the authentication response
      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: storedCred.credential_id,
          publicKey: Buffer.from(storedCred.public_key, 'base64'),
          counter: storedCred.counter,
        },
      })

      if (!verification.verified) {
        return NextResponse.json({ error: 'Verification failed' }, { status: 401 })
      }

      // Update counter
      await supabase
        .from('passkey_credentials')
        .update({ counter: verification.authenticationInfo.newCounter })
        .eq('credential_id', credentialId)

      // Create session
      const user = storedCred.users
      const sessionToken = await createSessionToken(user.id, user.email)

      const response = NextResponse.json({ success: true })
      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS)

      return response
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[passkey/authenticate] error:', err)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
