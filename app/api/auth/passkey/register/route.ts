import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { getUserIdFromRequest } from '@/lib/auth'

const RP_ID = process.env.PASSKEY_RP_ID || 'footprint.onl'
const RP_NAME = 'Footprint'
const RP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://www.footprint.onl'

// In-memory challenge store for registration
const challengeStore = new Map<string, { challenge: string; userId: string; expires: number }>()

function cleanExpired() {
  const now = Date.now()
  challengeStore.forEach((v, k) => {
    if (v.expires < now) challengeStore.delete(k)
  })
}

/**
 * POST /api/auth/passkey/register
 *
 * Passkey registration for authenticated users.
 * Two-phase: "options" then "verify"
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const action = body?.action

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Get user info
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (action === 'options') {
      cleanExpired()

      // Get existing credentials to exclude
      const { data: existingCreds } = await supabase
        .from('passkey_credentials')
        .select('credential_id')
        .eq('user_id', userId)

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: user.email,
        userDisplayName: user.email,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        },
        excludeCredentials: (existingCreds || []).map(c => ({
          id: c.credential_id,
        })),
      })

      const sessionId = crypto.randomUUID()
      challengeStore.set(sessionId, {
        challenge: options.challenge,
        userId,
        expires: Date.now() + 5 * 60 * 1000,
      })

      return NextResponse.json({ ...options, sessionId })
    }

    if (action === 'verify') {
      const { credential, sessionId, name } = body
      if (!credential || !sessionId) {
        return NextResponse.json({ error: 'Missing credential or session' }, { status: 400 })
      }

      const stored = challengeStore.get(sessionId)
      if (!stored || stored.expires < Date.now() || stored.userId !== userId) {
        challengeStore.delete(sessionId)
        return NextResponse.json({ error: 'Challenge expired' }, { status: 400 })
      }
      challengeStore.delete(sessionId)

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: RP_ORIGIN,
        expectedRPID: RP_ID,
      })

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
      }

      const { credential: regCred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

      // Store credential
      await supabase.from('passkey_credentials').insert({
        user_id: userId,
        credential_id: regCred.id,
        public_key: Buffer.from(regCred.publicKey).toString('base64'),
        counter: regCred.counter,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        name: name || 'Passkey',
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[passkey/register] error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
