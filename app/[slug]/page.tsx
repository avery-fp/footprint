import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getTheme } from '@/lib/themes'
import { getFootprintDisplayTitle } from '@/lib/footprint'
import { loadFootprint } from '@/lib/loadFootprint'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ShareEngine from '@/components/ShareEngine'
import EventTracker from '@/components/EventTracker'
import ReferralBanner from '@/components/ReferralBanner'
import ClaimOverlay from '@/components/ClaimOverlay'
import PublicPage from './PublicPage'

// ISR — cache page at the edge, revalidate every 5 seconds while we debug
// the editor/public divergence. The 60s window was masking whether fixes
// landed by serving stale data for up to a minute after an edit. Bump back
// up once the shared-loader work is in and the mismatch is gone.
export const revalidate = 5

interface Props {
  params: { slug: string }
}

// Reserved paths that have their own routes — skip DB lookup
const RESERVED_SLUGS = new Set(['build', 'login', 'signup', 'signin', 'auth', 'checkout', 'success', 'deed', 'gift', 'public', 'api', 'preview'])

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (RESERVED_SLUGS.has(params.slug)) return { title: 'footprint' }

  const supabase = createServerSupabaseClient()
  const { data: footprint } = await supabase
    .from('footprints')
    .select('display_title, display_name, name, username, bio, dimension, serial_number')
    .eq('username', params.slug)
    .eq('published', true)
    .single()

  if (!footprint) return { title: 'Footprint' }

  const serial = footprint.serial_number || 0
  const displayTitle = getFootprintDisplayTitle(footprint)
  const title = displayTitle
    ? `${displayTitle} · Footprint #${serial}`
    : `Footprint #${serial}`

  return {
    title,
    description: footprint.bio || 'one page for everything.',
    openGraph: {
      title,
      description: footprint.bio || 'one page for everything.',
      images: [`https://footprint.onl/api/og?slug=${params.slug}`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: footprint.bio || 'one page for everything.',
      images: [`https://footprint.onl/api/og?slug=${params.slug}`],
    },
  }
}

export default async function FootprintPage({ params }: Props) {
  if (RESERVED_SLUGS.has(params.slug)) notFound()

  const result = await loadFootprint(params.slug, { ownerView: false })
  if (!result) notFound()

  const { footprint, content, rooms: roomsFlat, containerMeta } = result

  const supabase = createServerSupabaseClient()
  const { data: owner } = await supabase
    .from('users')
    .select('email')
    .eq('id', footprint.user_id)
    .maybeSingle()

  // Public page expects rooms with their content already grouped in.
  const rooms = roomsFlat.map(room => ({
    ...room,
    content: content.filter(item => item.room_id === room.id),
  }))

  const serial = footprint.serial_number.toString().padStart(4, '0')
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`

  return (
    <>
      {/* footprint.id was dropped from the schema; user_id (UUID) is the
          stable identifier for analytics. fp_events.footprint_id still carries
          UUID type so we send user_id there. */}
      <AnalyticsTracker footprintId={footprint.user_id} serialNumber={footprint.serial_number} />
      <EventTracker footprintId={footprint.user_id} />
      <ReferralBanner serial={serial} />
      <ShareEngine slug={params.slug} />
      <ClaimOverlay slug={params.slug} />
      <PublicPage
        footprint={footprint}
        content={content}
        rooms={rooms}
        theme={theme}
        serial={serial}
        pageUrl={pageUrl}
        containerMeta={containerMeta}
        ownerEmail={owner?.email || null}
      />
    </>
  )
}
