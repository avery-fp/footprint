import { redirect } from 'next/navigation'

/**
 * Root fallback — middleware normally redirects `/` → `/home` (HTTP 307).
 * This server component exists only as a safety net.
 */
export default function RootPage() {
  redirect('/home')
}
