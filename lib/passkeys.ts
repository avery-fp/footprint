import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types'
import { createServerSupabaseClient } from './supabase'
import { normalizeEmail } from './auth'

// ── RP (Relying Party) config ──
const RP_NAME = 'Footprint'
const RP_ID = process.env.NODE_ENV === 'production' ? 'footprint.onl' : 'localhost'
const RP_ORIGIN = process.env.NODE_ENV === 'production'
  ? 'https://www.footprint.onl'
  : 'http://localhost:3000'

interface StoredCredential {
  credential_id: string
  public_key: string
  counter: number
  transports: string[]
}

// ── Challenge store (DB-backed) ──

export async function storeChallenge(
  challenge: string,
  userId: string | null,
  type: 'registration' | 'authentication'
) {
  const supabase = createServerSupabaseClient()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min TTL

  await supabase.from('webauthn_challenges').insert({
    challenge,
    user_id: userId,
    type,
    expires_at: expiresAt,
  })
}

export async function consumeChallenge(challenge: string): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('webauthn_challenges')
    .delete()
    .eq('challenge', challenge)
    .gt('expires_at', new Date().toISOString())
    .select('id')

  return (data?.length ?? 0) > 0
}

// ── Registration ──

export async function createRegistrationOptions(userId: string, email: string) {
  const supabase = createServerSupabaseClient()

  // Get existing credentials for this user (exclude list)
  const { data: existing } = await supabase
    .from('passkey_credentials')
    .select('credential_id')
    .eq('user_id', userId)

  const excludeCredentials = (existing || []).map(c => ({
    id: c.credential_id,
    transports: ['internal', 'hybrid'] as AuthenticatorTransportFuture[],
  }))

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: email,
    userDisplayName: email.split('@')[0],
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  // Store challenge
  await storeChallenge(options.challenge, userId, 'registration')

  return options
}

export async function verifyAndStoreRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  deviceName?: string
) {
  const valid = await consumeChallenge(expectedChallenge)
  if (!valid) throw new Error('Challenge expired or invalid')

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed')
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  const supabase = createServerSupabaseClient()

  // Store the credential
  const { error } = await supabase.from('passkey_credentials').insert({
    user_id: userId,
    credential_id: Buffer.from(credential.id).toString('base64url'),
    public_key: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: response.response.transports || [],
    device_name: deviceName || `${credentialDeviceType}${credentialBackedUp ? ' (backed up)' : ''}`,
  })

  if (error) throw new Error(`Failed to store credential: ${error.message}`)

  return verification
}

// ── Authentication ──

export async function createAuthenticationOptions(email?: string) {
  const supabase = createServerSupabaseClient()

  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] | undefined

  if (email) {
    // Find user by email, then get their credentials
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .ilike('email', normalizeEmail(email))
      .single()

    if (user) {
      const { data: creds } = await supabase
        .from('passkey_credentials')
        .select('credential_id, transports')
        .eq('user_id', user.id)

      allowCredentials = (creds || []).map(c => ({
        id: c.credential_id,
        transports: (c.transports || []) as AuthenticatorTransportFuture[],
      }))
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
    allowCredentials,
  })

  await storeChallenge(options.challenge, null, 'authentication')

  return options
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string
): Promise<{ userId: string; email: string } | null> {
  const valid = await consumeChallenge(expectedChallenge)
  if (!valid) return null

  const supabase = createServerSupabaseClient()

  // Look up credential
  const credentialId = response.id
  const { data: storedCred } = await supabase
    .from('passkey_credentials')
    .select('user_id, credential_id, public_key, counter, transports')
    .eq('credential_id', credentialId)
    .single()

  if (!storedCred) return null

  const credential: StoredCredential = storedCred

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: RP_ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credential.credential_id,
      publicKey: Buffer.from(credential.public_key, 'base64url'),
      counter: credential.counter,
      transports: (credential.transports || []) as AuthenticatorTransportFuture[],
    },
  })

  if (!verification.verified) return null

  // Update counter + last_used
  await supabase
    .from('passkey_credentials')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('credential_id', credentialId)

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', storedCred.user_id)
    .single()

  if (!user) return null

  return { userId: user.id, email: user.email }
}
