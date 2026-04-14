import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import HomeEntry from './HomeEntry'

export const dynamic = 'force-dynamic'

/**
 * /home — the single entry point.
 *
 * Authenticated + has footprint → redirect to /{slug}/home
 * Authenticated + no footprint → redirect to /{slug}/home (callback creates it)
 * Unauthenticated → render minimal Google auth page
 */
export default async function HomeResolver() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (token) {
    const session = await verifySessionToken(token)
    if (session) {
      const db = createServerSupabaseClient()
      const { data: footprint } = await db
        .from('footprints')
        .select('username')
        .eq('user_id', session.userId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (footprint?.username) {
        redirect(`/${footprint.username}/home`)
      }
      // Authenticated but no footprint — shouldn't happen after callback fix,
      // but fall through to render auth page which will re-trigger the flow
    }
  }

  // Unauthenticated — render the entry page
  return <HomeEntry />
}
