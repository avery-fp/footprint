import { redirect } from 'next/navigation'

interface SigninPageProps {
  searchParams?: {
    redirect?: string
  }
}

export default function SigninPage({ searchParams }: SigninPageProps) {
  const next = searchParams?.redirect
  const safeRedirect = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? `?redirect=${encodeURIComponent(next)}`
    : ''

  redirect(`/login${safeRedirect}`)
}
