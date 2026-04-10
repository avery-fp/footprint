import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { AUTH_ENTRY } from '@/lib/routes'

export const dynamic = 'force-dynamic'

/**
 * /home — silent resolver.
 *
 * Authenticated → look up primary slug → redirect to /{slug}/home
 * Unauthenticated → redirect to AUTH_ENTRY
 *
 * This is NOT a page. It never renders UI.
 */
export default async function HomeResolver() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!token) {
    redirect(AUTH_ENTRY)
  }

  const session = await verifySessionToken(token)
  if (!session) {
    redirect(AUTH_ENTRY)
  }

  const db = createServerSupabaseClient()
  const { data: footprint } = await db
    .from('footprints')
    .select('username')
    .eq('user_id', session.userId)
    .limit(1)
    .single()

  if (!footprint?.username) {
    redirect(AUTH_ENTRY)
  }

  redirect(`/${footprint.username}/home`)
}
