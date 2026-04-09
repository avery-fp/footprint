import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'
import { containerPostSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { transformImageUrl } from '@/lib/image'

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|3gp|3gpp|mkv)($|\?)/i

async function getSerialNumber(
  request: NextRequest,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  slug: string
): Promise<number | null> {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return null
  const { data: footprint } = await supabase
    .from('footprints')
    .select('serial_number, user_id')
    .eq('username', slug)
    .single()
  if (!footprint || footprint.user_id !== userId) return null
  return footprint.serial_number
}

/**
 * GET /api/containers?id=<container_tile_id>
 *
 * Fetch child tiles for a container tile.
 * Public endpoint — children inherit container visibility.
 */
export async function GET(request: NextRequest) {
  const containerId = request.nextUrl.searchParams.get('id')
  if (!containerId) {
    return NextResponse.json({ error: 'Container id required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const [{ data: images }, { data: links }] = await Promise.all([
    supabase.from('library').select('*').eq('parent_tile_id', containerId).order('position'),
    supabase.from('links').select('*').eq('parent_tile_id', containerId).order('position'),
  ])

  const children = [
    ...(images || []).map((img: any) => {
      const isVideo = VIDEO_EXT.test(img.image_url || '')
      return {
        id: img.id,
        type: isVideo ? 'video' : 'image',
        url: isVideo ? img.image_url : transformImageUrl(img.image_url),
        position: img.position,
        size: img.size || 1,
        aspect: img.aspect || null,
        caption: img.caption || null,
        source: 'library' as const,
      }
    }),
    ...(links || []).map((link: any) => ({
      id: link.id,
      type: link.platform,
      url: link.url,
      title: link.title,
      thumbnail_url: transformImageUrl(link.thumbnail_url_hq || link.thumbnail),
      embed_html: link.metadata?.embed_html,
      description: link.metadata?.description,
      position: link.position,
      size: link.size || 1,
      aspect: link.aspect || null,
      render_mode: link.render_mode || 'embed',
      artist: link.artist || null,
      thumbnail_url_hq: link.thumbnail_url_hq || null,
      media_id: link.media_id || null,
      source: 'links' as const,
    })),
  ].sort((a, b) => a.position - b.position)

  return NextResponse.json({ children })
}

/**
 * POST /api/containers
 *
 * Create a container tile.
 * Body: { slug, label, cover_url?, room_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(containerPostSchema, body)
    if (!v.success) return v.response
    const { slug, label, cover_url, room_id } = v.data

    const supabase = createServerSupabaseClient()
    const serialNumber = await getSerialNumber(request, supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Unauthorized or not found' }, { status: 403 })
    }

    // Get next position
    const { data: maxPos } = await supabase
      .from('links')
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    const { data: tile, error } = await supabase
      .from('links')
      .insert({
        serial_number: serialNumber,
        url: `container://${Date.now()}`,
        platform: 'container',
        title: label,
        container_label: label,
        container_cover_url: cover_url || null,
        position: nextPosition,
        room_id: room_id || null,
        size: 2,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to create container' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)
    return NextResponse.json({
      tile: {
        id: tile.id,
        type: 'container',
        url: tile.url,
        title: tile.title,
        container_label: tile.container_label,
        container_cover_url: tile.container_cover_url,
        position: tile.position,
        size: tile.size,
        room_id: tile.room_id,
        source: 'links',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create container' }, { status: 500 })
  }
}
