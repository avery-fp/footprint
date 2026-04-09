import { redirect } from 'next/navigation'
import { AUTH_ENTRY } from '@/lib/routes'

export default function SignupPage() {
  redirect(AUTH_ENTRY)
}
