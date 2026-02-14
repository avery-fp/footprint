import { createServerSupabaseClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getTheme } from '@/lib/themes'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import PublicPage from './PublicPage'

// ISR — cache page at the edge, revalidate every 10 seconds
export const revalidate = 10

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
    description: footprint.bio || 'a room for your internet. $10.',
    openGraph: {
      title,
      description: footprint.bio || 'a room for your internet. $10.',
      images: [`https://footprint.onl/api/og?slug=${params.slug}`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: footprint.bio || 'a room for your internet. $10.',
      images: [`https://footprint.onl/api/og?slug=${params.slug}`],
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

  // Fetch tiles from library (images) + links (embeds/urls)
  const [{ data: images }, { data: links }] = await Promise.all([
    supabase.from('library').select('*').eq('serial_number', footprint.serial_number).order('position'),
    supabase.from('links').select('*').eq('serial_number', footprint.serial_number).order('position'),
  ])

  // Merge and sort by position
  const content = [
    ...(images || []).map((img: any) => ({
      id: img.id,
      type: 'image',
      url: img.image_url,
      position: img.position,
      room_id: img.room_id,
      size: img.size || 1,
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
    })),
  ].sort((a, b) => a.position - b.position)

  // Fetch rooms if they exist
  const { data: roomsData } = await supabase
    .from('rooms')
    .select('*')
    .eq('serial_number', footprint.serial_number)
    .neq('hidden', true)
    .order('position')

  // Group content by rooms
  const rooms = (roomsData || []).map((room: any) => ({
    id: room.id,
    name: room.name,
    content: content.filter(item => item.room_id === room.id),
  }))

  const serial = footprint.serial_number.toString().padStart(4, '0')
  const theme = getTheme(footprint.dimension || 'midnight')
  const pageUrl = `https://footprint.onl/${params.slug}`

  return (
    <>
      <AnalyticsTracker footprintId={footprint.id} />
      <PublicPage
        footprint={footprint}
        content={content}
        rooms={rooms}
        theme={theme}
        serial={serial}
        pageUrl={pageUrl}
      />
    </>
  )
}
