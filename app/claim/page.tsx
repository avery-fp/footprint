import { cookies } from 'next/headers'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth'
import ClaimClient from './ClaimClient'

/**
 * /claim — The entire conversion event.
 *
 * Server component reads auth state from fp_session cookie.
 * No client flash, no guessing — server-rendered truth on first paint.
 *
 * Logged out → Phase 1: Google, Apple, price.
 * Logged in  → Phase 2: username, promo, pay.
 */
export default async function ClaimPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  let authenticated = false

  if (token) {
    const session = await verifySessionToken(token)
    authenticated = !!session
  }

  return <ClaimClient authenticated={authenticated} />
}
