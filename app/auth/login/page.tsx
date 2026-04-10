import { redirect } from 'next/navigation'

interface AuthLoginPageProps {
  searchParams?: {
    redirect?: string
  }
}

export default function AuthLoginPage({ searchParams }: AuthLoginPageProps) {
  const next = searchParams?.redirect
  const safeRedirect = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? `?redirect=${encodeURIComponent(next)}`
    : ''

  redirect(`/login${safeRedirect}`)
}
