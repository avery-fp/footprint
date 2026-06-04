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
import { withPublicTileGeometry } from '@/lib/public-tile-geometry'

function collectPublicPosterPreloads(
  rooms: Array<{ content: any[] }>,
  content: any[],
  containerMeta: Record<string, { childCount: number; firstThumb: string | null }>
) {
  const ordered = rooms.length > 0
    ? rooms.flatMap((room) => room.content || [])
    : content
  const seen = new Set<string>()
  const urls: string[] = []

  for (const item of ordered) {
    const url =
      item?.thumbnail_url_override ||
      item?.thumbnail_url_hq ||
      item?.thumbnail_url ||
      containerMeta[item?.id]?.firstThumb ||
      (item?.type === 'image' || item?.type === 'video' ? item?.url : null)
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
    if (urls.length >= 10) break
  }

  return urls
}

// ISR for the public surface. The route renders the same artifact for every
// visitor; owner/editor state is resolved client-side after the static shell
// loads.
export const revalidate = 60
export const dynamic = 'force-static'

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

  const manifest = `/${encodeURIComponent(params.slug)}/manifest.webmanifest`

  // Drafts are pre-purchase previews — never expose the serial number in
  // titles or OG cards. The number is the scarcity hook that lights up at
  // claim, not before.
  if (isDraft) {
    const displayTitle = getFootprintDisplayTitle(footprint)
    return {
      title: displayTitle ? `${displayTitle} · preview` : 'preview · footprint',
      description: footprint.bio || 'one page for everything.',
      manifest,
      appleWebApp: {
        capable: true,
        title: 'Footprint',
        statusBarStyle: 'black-translucent',
      },
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
    manifest,
    appleWebApp: {
      capable: true,
      title: 'Footprint',
      statusBarStyle: 'black-translucent',
    },
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
  // credential. ownerView drops the `published = true` filter so unpublished
  // (work-in-progress) state renders for the draft without a 404.
  const isDraft = params.slug.startsWith('draft-')
  const ownerView = isDraft

  const result = await loadFootprint(params.slug, { ownerView })
  if (!result) notFound()

  const { footprint, content, rooms: roomsFlat, containerMeta } = result
  const contentWithGeometry = content.map(withPublicTileGeometry)

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
    content: contentWithGeometry.filter(item =>
      item.room_id === room.id ||
      (room.id === orphanTargetRoomId && !item.room_id)
    ),
  }))

  // Drafts have no public-facing serial — empty string keeps the bottom-left
  // serial flyout inert (PublicPage already gates it on `!isDraft && serial`,
  // both signals point the same way for safety).
  const serial = isDraft || footprint.serial_number == null
    ? ''
    : footprint.serial_number.toString().padStart(4, '0')
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`
  const publicPosterPreloads = ownerView
    ? []
    : collectPublicPosterPreloads(rooms, contentWithGeometry, containerMeta)

  return (
    <>
      {publicPosterPreloads.map((url) => (
        <link key={url} rel="preload" as="image" href={url} />
      ))}
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
        content={contentWithGeometry}
        rooms={rooms}
        theme={theme}
        serial={serial}
        pageUrl={pageUrl}
        containerMeta={containerMeta}
        isDraft={isDraft}
      />
    </>
  )
}
