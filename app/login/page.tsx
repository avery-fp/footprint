import { redirect } from 'next/navigation'
import { AUTH_ENTRY } from '@/lib/routes'

/**
 * Static redirect: /login -> /ae?claim=1
 *
 * Kept as a redirect (not deleted) because external bookmarks, welcome emails,
 * and stale references in the codebase still point here. Any direct hit lands
 * on the canonical auth entry in a single hop instead of 404'ing into the
 * not-found loop.
 */
export default function LoginPage() {
  redirect(AUTH_ENTRY)
}
