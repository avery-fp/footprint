import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { titleFromUrl } from '@/lib/container-child-ops'
import { z } from 'zod'

const bodySchema = z.object({
  slug: z.string().min(1, 'slug required'),
  url: z.string().min(1, 'url required'),
})

/**
 * POST /api/containers/[tileId]/items
 *
 * Atomically create a link child inside a container tile.
 * parent_tile_id is set on insert — the item never appears in the main grid.
 *
 * Body: { slug, url }
 * Response: { child: ChildTile }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tileId: string }> }
) {
  const { tileId } = await params
  if (!tileId) {
    return NextResponse.json({ error: 'tileId required' }, { status: 400 })
  }

  let slug: string
  let url: string
  try {
    const raw = await request.json()
    const v = bodySchema.safeParse(raw)
    if (!v.success) {
      return NextResponse.json({ error: v.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    ;({ slug, url } = v.data)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Normalize bare URLs (e.g. "example.com" → "https://example.com")
  const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`

  const supabase = createServerSupabaseClient()

  // Owner check
  const auth = await getEditAuth(request, slug)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: footprint } = await supabase
    .from('footprints')
    .select('serial_number')
    .eq('username', slug)
    .single()
  if (!footprint) {
    return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
  }

  const serialNumber = footprint.serial_number

  // Confirm the container belongs to this footprint
  const { data: container } = await supabase
    .from('links')
    .select('id')
    .eq('id', tileId)
    .eq('serial_number', serialNumber)
    .eq('platform', 'container')
    .single()
  if (!container) {
    return NextResponse.json({ error: 'Container not found' }, { status: 404 })
  }

  // Find max position across both child tables so we append at the end
  const [{ data: libMax }, { data: linkMax }] = await Promise.all([
    supabase
      .from('library')
      .select('position')
      .eq('parent_tile_id', tileId)
      .order('position', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('links')
      .select('position')
      .eq('parent_tile_id', tileId)
      .order('position', { ascending: false })
      .limit(1)
      .single(),
  ])
  const nextPosition = Math.max(libMax?.position ?? -1, linkMax?.position ?? -1) + 1

  const title = titleFromUrl(normalizedUrl)

  const { data: row, error } = await supabase
    .from('links')
    .insert({
      serial_number: serialNumber,
      url: normalizedUrl,
      platform: 'link',
      title,
      position: nextPosition,
      parent_tile_id: tileId,
      size: 1,
      render_mode: 'link_only',
    })
    .select()
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }

  revalidatePath(`/${slug}`)

  return NextResponse.json({
    child: {
      id: row.id,
      type: 'link',
      url: row.url,
      title: row.title,
      description: null,
      thumbnail_url: null,
      embed_html: null,
      position: row.position,
      size: row.size || 1,
      aspect: row.aspect || null,
      render_mode: 'link_only',
      artist: null,
      thumbnail_url_hq: null,
      media_id: null,
      source: 'links' as const,
    },
  })
}
