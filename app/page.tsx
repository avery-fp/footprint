import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth'

/**
 * Root fallback — middleware normally redirects `/` → `/ae` or `/home` (HTTP 307).
 * This server component exists only as a safety net and mirrors the middleware logic:
 * - Stranger → /ae (the room IS the homepage)
 * - Authenticated → /home → resolves to /{slug}/home
 *
 * Stale or expired cookies are treated as stranger. A cookie that merely
 * exists is not a session; if verify fails, the user gets the room, not a
 * sign-in wall.
 */
export default async function RootPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const authed = token ? (await verifySessionToken(token)) !== null : false
  redirect(authed ? '/home' : '/ae')
}
