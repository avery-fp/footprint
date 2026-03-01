import { createServerSupabaseClient } from '@/lib/supabase'
import { getTheme } from '@/lib/themes'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ShareEngine from '@/components/ShareEngine'
import EventTracker from '@/components/EventTracker'
import ReferralBanner from '@/components/ReferralBanner'
import PublicPage from './[slug]/PublicPage'
import { mediaTypeFromUrl } from '@/lib/media'

export const dynamic = 'force-dynamic'

const AE_SLUG = 'ae'

export default async function Home() {
  const supabase = createServerSupabaseClient()

  // Fetch the ae footprint
  const { data: footprint } = await supabase
    .from('footprints')
    .select('*')
    .eq('username', AE_SLUG)
    .single()

  if (!footprint) {
    // Fallback: minimal dark screen if ae doesn't exist
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <p className="text-white/20 text-sm font-mono">footprint</p>
      </div>
    )
  }

  // Fetch tiles + rooms
  const [{ data: images }, { data: links }, { data: roomsData }] = await Promise.all([
    supabase.from('library').select('*').eq('serial_number', footprint.serial_number).order('position'),
    supabase.from('links').select('*').eq('serial_number', footprint.serial_number).order('position'),
    supabase.from('rooms').select('*').eq('serial_number', footprint.serial_number).neq('hidden', true).order('position'),
  ])

  // Merge and sort
  const content = [
    ...(images || []).map((img: any) => ({
      id: img.id,
      type: mediaTypeFromUrl(img.image_url),
      url: img.image_url,
      position: img.position,
      room_id: img.room_id,
      size: img.size || 1,
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
    })),
  ].sort((a, b) => a.position - b.position)

  // Group content by rooms
  const rooms = (roomsData || []).map((room: any) => ({
    id: room.id,
    name: room.name,
    content: content.filter(item => item.room_id === room.id),
  }))

  const serial = footprint.serial_number.toString().padStart(4, '0')
  const theme = getTheme(footprint.dimension || 'midnight')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'
  const pageUrl = `${baseUrl}/${AE_SLUG}`

  return (
    <>
      <AnalyticsTracker footprintId={footprint.id} serialNumber={footprint.serial_number} />
      <EventTracker footprintId={footprint.id} />
      <ReferralBanner serial={serial} />
      <ShareEngine slug={AE_SLUG} />
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
