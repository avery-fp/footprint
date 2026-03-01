import { createServerSupabaseClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getTheme } from '@/lib/themes'
import { verifySessionToken } from '@/lib/auth'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ShareEngine from '@/components/ShareEngine'
import EventTracker from '@/components/EventTracker'
import ReferralBanner from '@/components/ReferralBanner'
import ErrorBoundary from '@/components/ErrorBoundary'
import { normalizeTileLayers } from '@/lib/layout-engine'
import { mediaTypeFromUrl } from '@/lib/media'
import PublicPage from './PublicPage'

// ISR — cache page at the edge, revalidate every 60 seconds
export const revalidate = 60

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServerSupabaseClient()
  const { data: footprint } = await supabase
    .from('footprints')
    .select('display_name, bio, dimension, serial_number, published')
    .eq('username', params.slug)
    .single()

  // Don't leak metadata for unpublished footprints
  if (!footprint || !footprint.published) return { title: 'Footprint' }

  const serial = footprint.serial_number || 0
  const title = footprint.display_name
    ? `${footprint.display_name} · Footprint #${serial}`
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
  const supabase = createServerSupabaseClient()

  // Fetch footprint by username (don't filter by published — we check ownership for drafts)
  const { data: footprint } = await supabase
    .from('footprints')
    .select('*')
    .eq('username', params.slug)
    .single()

  if (!footprint) notFound()

  // URL gating: unpublished footprints are invisible to non-owners (404)
  // The public URL only activates after payment. Before that, it doesn't exist.
  let isDraft = false
  if (!footprint.published) {
    const cookieStore = cookies()
    const token = cookieStore.get('fp_session')?.value
    if (!token) {
      // No session — URL doesn't exist yet (not published)
      notFound()
    }
    const session = await verifySessionToken(token)
    if (!session || session.userId !== footprint.user_id) {
      // Logged in but not the owner — URL doesn't exist for them
      notFound()
    }
    // Owner sees their draft with edit capabilities
    isDraft = true
  }

  // Fetch tiles + rooms in parallel (only if serial_number exists)
  let content: any[] = []
  let rooms: any[] = []

  if (footprint.serial_number) {
    const [{ data: images }, { data: links }, { data: roomsData }] = await Promise.all([
      supabase.from('library').select('*').eq('serial_number', footprint.serial_number).order('position'),
      supabase.from('links').select('*').eq('serial_number', footprint.serial_number).order('position'),
      supabase.from('rooms').select('*').eq('serial_number', footprint.serial_number).neq('hidden', true).order('position'),
    ])

    // Merge and sort by position
    content = [
      ...(images || []).map((img: any) => ({
        id: img.id,
        type: mediaTypeFromUrl(img.image_url),
        url: img.image_url,
        position: img.position,
        room_id: img.room_id,
        size: img.size || 1,
        aspect: img.aspect || null,
        caption: img.caption || null,
      })),
      ...(links || []).map((link: any) => ({
        id: link.id,
        type: link.platform,
        url: link.url,
        title: link.title,
        thumbnail_url: link.thumbnail,
        embed_html: link.metadata?.embed_html,
        description: link.metadata?.description,
        position: link.position,
        room_id: link.room_id,
        size: link.size || 1,
        aspect: link.aspect || null,
      })),
    ].sort((a, b) => a.position - b.position)
      .map(normalizeTileLayers)

    // Group content by rooms
    rooms = (roomsData || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      content: content.filter(item => item.room_id === room.id),
    }))
  }

  const serial = footprint.serial_number ? footprint.serial_number.toString().padStart(4, '0') : '0000'
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`

  return (
    <>
      {footprint.serial_number && (
        <>
          <AnalyticsTracker footprintId={footprint.id} serialNumber={footprint.serial_number} />
          <EventTracker footprintId={footprint.id} />
          <ReferralBanner serial={serial} />
        </>
      )}
      <ShareEngine slug={params.slug} />
      <ErrorBoundary context="profile">
        <PublicPage
          footprint={footprint}
          content={content}
          rooms={rooms}
          theme={theme}
          serial={serial}
          pageUrl={pageUrl}
          isDraft={isDraft}
        />
      </ErrorBoundary>
    </>
  )
}
