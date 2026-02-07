import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getTheme } from '@/lib/themes'
import { transformImageUrl } from '@/lib/image'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ShareButton from '@/components/ShareButton'
import PublicPage from './PublicPage'

// Force dynamic rendering - never statically generate user pages
export const dynamic = 'force-dynamic'
// Disable all caching and revalidation
export const revalidate = 0

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
    description: footprint.bio || 'A digital footprint',
    openGraph: {
      title,
      description: footprint.bio || 'A digital footprint',
      images: [`/api/og?slug=${params.slug}`],
    },
  }
}

export default async function FootprintPage({ params }: Props) {
  const supabase = createServerSupabaseClient()

  // Fetch footprint by username + published
  const { data: footprint } = await supabase
    .from('footprints')
    .select('*')
    .eq('username', params.slug)
    .eq('published', true)
    .single()

  if (!footprint) notFound()

  // Fetch tiles from library (images) + links (embeds/urls) + counts for pagination
  const [{ data: images }, { data: links }, { count: imageCount }, { count: linkCount }] = await Promise.all([
    supabase.from('library').select('*').eq('serial_number', footprint.serial_number).order('position'),
    supabase.from('links').select('*').eq('serial_number', footprint.serial_number).order('position'),
    supabase.from('library').select('*', { count: 'exact', head: true }).eq('serial_number', footprint.serial_number),
    supabase.from('links').select('*', { count: 'exact', head: true }).eq('serial_number', footprint.serial_number),
  ])

  // Merge and sort by position
  const content = [
    ...(images || []).map((img: any) => ({
      id: img.id,
      type: 'image',
      url: img.image_url,
      position: img.position,
      room_id: img.room_id,
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
    })),
  ].sort((a, b) => a.position - b.position)

  const totalCount = (imageCount || 0) + (linkCount || 0)

  // Transform image URLs server-side so SSR HTML has optimized URLs
  const transformContent = (items: typeof content) => items.map(item => ({
    ...item,
    url: transformImageUrl(item.url) ?? item.url,
    thumbnail_url: 'thumbnail_url' in item ? (transformImageUrl(item.thumbnail_url) ?? item.thumbnail_url) : undefined,
  }))

  const initialContent = transformContent(content.slice(0, 24))

  // Fetch rooms if they exist
  const { data: roomsData } = await supabase
    .from('rooms')
    .select('*')
    .eq('serial_number', footprint.serial_number)
    .order('position')

  // Group content by rooms (with transformed URLs)
  const rooms = (roomsData || []).map((room: any) => ({
    id: room.id,
    name: room.name,
    content: transformContent(content.filter(item => item.room_id === room.id)),
  }))

  const serial = footprint.serial_number.toString().padStart(4, '0')
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`

  return (
    <>
      <AnalyticsTracker footprintId={footprint.id} />
      <ShareButton url={pageUrl} />
      <PublicPage
        footprint={footprint}
        content={initialContent}
        rooms={rooms}
        theme={theme}
        serial={serial}
        pageUrl={pageUrl}
        totalCount={totalCount}
      />
    </>
  )
}
