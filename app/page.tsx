import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth'

export default async function Home() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  if (session) {
    redirect('/home')
  }

  redirect('/ae')
}
