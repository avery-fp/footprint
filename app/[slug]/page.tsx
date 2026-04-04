import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getTheme } from '@/lib/themes'
import { transformImageUrl } from '@/lib/image'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ShareEngine from '@/components/ShareEngine'
import EventTracker from '@/components/EventTracker'
import ReferralBanner from '@/components/ReferralBanner'
import PublicPage from './PublicPage'

// ISR — cache page at the edge, revalidate every 60 seconds
export const revalidate = 60

interface Props {
  params: { slug: string }
}

// Reserved paths that have their own routes — skip DB lookup
const RESERVED_SLUGS = new Set(['build', 'login', 'signup', 'signin', 'auth', 'checkout', 'success', 'deed', 'gift', 'public', 'api'])

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (RESERVED_SLUGS.has(params.slug)) return { title: 'footprint' }

  const supabase = createServerSupabaseClient()
  const { data: footprint } = await supabase
    .from('footprints')
    .select('display_name, bio, dimension, serial_number')
    .eq('username', params.slug)
    .eq('published', true)
    .single()

  if (!footprint) return { title: 'Footprint' }

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
  if (RESERVED_SLUGS.has(params.slug)) notFound()

  const supabase = createServerSupabaseClient()

  // Fetch footprint by username + published
  const { data: footprint } = await supabase
    .from('footprints')
    .select('*')
    .eq('username', params.slug)
    .eq('published', true)
    .single()

  if (!footprint) notFound()

  // Fetch tiles + rooms in parallel (single round-trip, no waterfall)
  // Street level only: parent_tile_id IS NULL (children render inside containers)
  const [{ data: images }, { data: links }, { data: roomsData }, { data: childImages }, { data: childLinks }] = await Promise.all([
    supabase.from('library').select('*').eq('serial_number', footprint.serial_number).is('parent_tile_id', null).order('position'),
    supabase.from('links').select('*').eq('serial_number', footprint.serial_number).is('parent_tile_id', null).order('position'),
    supabase.from('rooms').select('*').eq('serial_number', footprint.serial_number).neq('hidden', true).order('position'),
    // Lightweight child queries for container facade metadata (count + first thumbnail)
    supabase.from('library').select('id, parent_tile_id, image_url, position').eq('serial_number', footprint.serial_number).not('parent_tile_id', 'is', null).order('position'),
    supabase.from('links').select('id, parent_tile_id, thumbnail, position').eq('serial_number', footprint.serial_number).not('parent_tile_id', 'is', null).order('position'),
  ])

  // Canonical type from URL — library has no type column, so derive once here
  const VIDEO_EXT = /\.(mp4|mov|webm|m4v|3gp|3gpp|mkv)($|\?)/i

  // Merge and sort by position
  const content = [
    ...(images || []).map((img: any) => {
      const isVideo = VIDEO_EXT.test(img.image_url || '')
      return {
        id: img.id,
        type: isVideo ? 'video' : 'image',
        url: isVideo ? img.image_url : transformImageUrl(img.image_url),
        position: img.position,
        room_id: img.room_id,
        size: img.size || 1,
        aspect: img.aspect || null,
        caption: img.caption || null,
      }
    }),
    ...(links || []).map((link: any) => ({
      id: link.id,
      type: link.platform,
      url: link.url,
      title: link.title,
      thumbnail_url: transformImageUrl(link.thumbnail),
      embed_html: link.metadata?.embed_html,
      description: link.metadata?.description,
      position: link.position,
      room_id: link.room_id,
      size: link.size || 1,
      aspect: link.aspect || null,
      render_mode: link.render_mode || 'embed',
      artist: link.artist || null,
      thumbnail_url_hq: link.thumbnail_url_hq || null,
      media_id: link.media_id || null,
      // Container tile fields
      container_label: link.container_label || null,
      container_cover_url: link.container_cover_url || null,
    })),
  ].sort((a, b) => a.position - b.position)

  // Group content by rooms
  const rooms = (roomsData || []).map((room: any) => ({
    id: room.id,
    name: room.name,
    layout: room.layout === 'editorial' ? 'mix' : (['grid', 'mix', 'rail'] as const).includes(room.layout) ? room.layout : 'grid',
    content: content.filter(item => item.room_id === room.id),
  }))

  // Build container facade metadata: child count + first child thumbnail
  const containerMeta: Record<string, { childCount: number; firstThumb: string | null }> = {}
  for (const img of (childImages || []).sort((a: any, b: any) => a.position - b.position)) {
    if (!img.parent_tile_id) continue
    if (!containerMeta[img.parent_tile_id]) containerMeta[img.parent_tile_id] = { childCount: 0, firstThumb: null }
    containerMeta[img.parent_tile_id].childCount++
    if (!containerMeta[img.parent_tile_id].firstThumb && img.image_url) {
      containerMeta[img.parent_tile_id].firstThumb = transformImageUrl(img.image_url)
    }
  }
  for (const link of (childLinks || []).sort((a: any, b: any) => a.position - b.position)) {
    if (!link.parent_tile_id) continue
    if (!containerMeta[link.parent_tile_id]) containerMeta[link.parent_tile_id] = { childCount: 0, firstThumb: null }
    containerMeta[link.parent_tile_id].childCount++
    if (!containerMeta[link.parent_tile_id].firstThumb && link.thumbnail) {
      containerMeta[link.parent_tile_id].firstThumb = transformImageUrl(link.thumbnail)
    }
  }

  const serial = footprint.serial_number.toString().padStart(4, '0')
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`

  return (
    <>
      <AnalyticsTracker footprintId={footprint.id} serialNumber={footprint.serial_number} />
      <EventTracker footprintId={footprint.id} />
      <ReferralBanner serial={serial} />
      <ShareEngine slug={params.slug} />
      <PublicPage
        footprint={footprint}
        content={content}
        rooms={rooms}
        theme={theme}
        serial={serial}
        pageUrl={pageUrl}
        containerMeta={containerMeta}
      />
    </>
  )
}
