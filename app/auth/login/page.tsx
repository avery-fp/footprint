import { redirect } from 'next/navigation'

// Legacy catch-all for /auth/login references.
export default function AuthLoginPage() {
  redirect('/ae?claim=1')
}
