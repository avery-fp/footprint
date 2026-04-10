import { redirect } from 'next/navigation'

interface SignupPageProps {
  searchParams?: {
    redirect?: string
  }
}

export default function SignupPage({ searchParams }: SignupPageProps) {
  const next = searchParams?.redirect
  const safeRedirect = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? `?redirect=${encodeURIComponent(next)}`
    : ''

  redirect(`/login${safeRedirect}`)
}
