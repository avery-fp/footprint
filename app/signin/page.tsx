import { redirect } from 'next/navigation'
import { AUTH_ENTRY } from '@/lib/routes'

/**
 * Static redirect: /signin -> /ae?claim=1
 *
 * Redirects directly instead of bouncing through /login (saves one hop).
 */
export default function SigninPage() {
  redirect(AUTH_ENTRY)
}
