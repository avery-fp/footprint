import { redirect } from 'next/navigation'

// Legacy catch-all: any external / cached / email-linked /login URLs land
// on the canonical claim entry. No page here on purpose.
export default function LoginPage() {
  redirect('/ae?claim=1')
}
