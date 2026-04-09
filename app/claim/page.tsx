import { redirect } from 'next/navigation'
import { AUTH_ENTRY } from '@/lib/routes'

export default function ClaimPage() {
  redirect(AUTH_ENTRY)
}
