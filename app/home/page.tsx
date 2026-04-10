import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth'
import { ensurePrimaryFootprintForUser } from '@/lib/primary-footprint'

const LOGIN_REDIRECT = '/login?redirect=%2Fhome'

export default async function HomeEntryPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  if (!session) {
    redirect(LOGIN_REDIRECT)
  }

  const footprint = await ensurePrimaryFootprintForUser(session.userId)

  if (!footprint) {
    redirect(LOGIN_REDIRECT)
  }

  redirect(`/${encodeURIComponent(footprint.slug)}/home`)
}
