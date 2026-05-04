import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getTheme } from '@/lib/themes'
import { getFootprintDisplayTitle } from '@/lib/footprint'
import { loadFootprint } from '@/lib/loadFootprint'
import AnalyticsTracker from '@/components/AnalyticsTracker'
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

  const isDraft = params.slug.startsWith('draft-')

  const supabase = createServerSupabaseClient()
  let query = supabase
    .from('footprints')
    .select('display_title, display_name, name, username, bio, dimension, serial_number')
    .eq('username', params.slug)
  if (!isDraft) query = query.eq('published', true)
  const { data: footprint } = await query.single()

  if (!footprint) return { title: 'Footprint' }

  // Drafts are pre-purchase previews — never expose the serial number in
  // titles or OG cards. The number is the scarcity hook that lights up at
  // claim, not before.
  if (isDraft) {
    const displayTitle = getFootprintDisplayTitle(footprint)
    return {
      title: displayTitle ? `${displayTitle} · preview` : 'preview · footprint',
      description: footprint.bio || 'one page for everything.',
    }
  }

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

  // Draft slugs (draft-{12-char uuid}) are unguessable preview URLs — the
  // owner can share one before paying. Knowledge of the slug IS the access
  // credential, same contract as the editor at /draft-{uuid}/home. ownerView
  // here just drops the `published = true` filter; loadFootprint does no
  // ownership check on its own.
  const isDraft = params.slug.startsWith('draft-')

  const result = await loadFootprint(params.slug, { ownerView: isDraft })
  if (!result) notFound()

  const { footprint, content, rooms: roomsFlat, containerMeta } = result

  const supabase = createServerSupabaseClient()
  const { data: owner } = footprint.user_id
    ? await supabase
        .from('users')
        .select('email')
        .eq('id', footprint.user_id)
        .maybeSingle()
    : { data: null }

  // Public page expects rooms with their content already grouped in.
  // Tiles with room_id=null (orphans — typically uploads that landed before
  // a room was assigned, or rows where the room was deleted) are included
  // in the first VISIBLE room so they remain reachable. Without this, an
  // orphan never matches any room and silently disappears from every view.
  // Targeting the first named room (vs the raw first row) ensures orphans
  // don't get parked in a hidden room — PublicPage filters out empty-name
  // rooms client-side, which would re-orphan them.
  const orphanTargetRoomId =
    roomsFlat.find(r => r.name && r.name.trim().length > 0)?.id ?? null
  const rooms = roomsFlat.map(room => ({
    ...room,
    content: content.filter(item =>
      item.room_id === room.id ||
      (room.id === orphanTargetRoomId && !item.room_id)
    ),
  }))

  // Drafts have no public-facing serial — empty string keeps the bottom-left
  // serial flyout inert (PublicPage already gates it on `!isDraft && serial`,
  // both signals point the same way for safety).
  const serial = isDraft ? '' : footprint.serial_number.toString().padStart(4, '0')
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`

  return (
    <>
      {/* Drafts skip analytics, referral banner, and the post-claim overlay:
          user_id is null for anonymous drafts, the serial isn't claimed yet,
          and there's no claim event to animate. */}
      {!isDraft && (
        <>
          {/* footprint.id was dropped from the schema; user_id (UUID) is the
              stable identifier for analytics. fp_events.footprint_id still carries
              UUID type so we send user_id there. */}
          <AnalyticsTracker footprintId={footprint.user_id} serialNumber={footprint.serial_number} />
          <EventTracker footprintId={footprint.user_id} />
          <ReferralBanner serial={serial} />
          <ClaimOverlay slug={params.slug} />
        </>
      )}
      <PublicPage
        footprint={footprint}
        content={content}
        rooms={rooms}
        theme={theme}
        serial={serial}
        pageUrl={pageUrl}
        containerMeta={containerMeta}
        ownerEmail={owner?.email || null}
        isDraft={isDraft}
      />
    </>
  )
}
