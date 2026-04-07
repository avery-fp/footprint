import { redirect } from 'next/navigation'
import { AUTH_ENTRY } from '@/lib/routes'

/**
 * Static redirect: /auth/login -> /ae?claim=1
 *
 * Sibling of /login. Kept as a redirect for the same reasons — stale callers
 * (notably app/[slug]/home/page.tsx:898 on network error) still point here
 * until PR #3 cleans them up.
 */
export default function AuthLoginPage() {
  redirect(AUTH_ENTRY)
}
