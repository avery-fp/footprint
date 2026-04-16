import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME } from '@/lib/auth'

/**
 * Root fallback — middleware normally redirects `/` → `/ae` or `/home` (HTTP 307).
 * This server component exists only as a safety net and mirrors the middleware logic:
 * - Stranger → /ae (the room IS the homepage)
 * - Authenticated → /home → resolves to /{slug}/home
 */
export default async function RootPage() {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE_NAME)
  redirect(session ? '/home' : '/ae')
}
