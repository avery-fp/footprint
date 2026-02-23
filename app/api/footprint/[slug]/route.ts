import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/footprint/[slug]
 *
 * Returns footprint + tiles for the edit page.
 * Requires auth — only the owner can access.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ owned: false }, { status: 401 })
    }

    const username = params.slug
    const supabase = createServerSupabaseClient()

    const { data: footprint, error: footprintError } = await supabase
      .from('footprints')
      .select('*')
      .eq('username', username)
      .single()

    if (footprintError || !footprint) {
      return NextResponse.json({ owned: false })
    }

    // Ownership check — user must own this footprint
    if (footprint.user_id !== userId) {
      return NextResponse.json({ owned: false }, { status: 403 })
    }

    const [libraryResult, linksResult] = await Promise.all([
      supabase
        .from('library')
        .select('*')
        .eq('serial_number', footprint.serial_number)
        .order('position', { ascending: true }),
      supabase
        .from('links')
        .select('*')
        .eq('serial_number', footprint.serial_number)
        .order('position', { ascending: true }),
    ])

    const libraryTiles = (libraryResult.data || []).map(item => ({
      id: item.id,
      url: item.image_url,
      type: 'image',
      title: item.title || null,
      description: null,
      thumbnail_url: null,
      embed_html: null,
      position: item.position,
      source: 'library' as const,
      room_id: item.room_id || null,
      size: item.size || 1,
      aspect: item.aspect || 'square',
      caption: item.caption || null,
    }))
    const linkTiles = (linksResult.data || []).map(item => ({
      id: item.id,
      url: item.url,
      type: item.platform,
      title: item.title,
      description: item.metadata?.description || null,
      thumbnail_url: item.thumbnail || null,
      embed_html: item.metadata?.embed_html || null,
      position: item.position,
      source: 'links' as const,
      room_id: item.room_id || null,
      size: item.size || 1,
      aspect: item.aspect || 'square',
    }))

    const allTiles = [...libraryTiles, ...linkTiles].sort((a, b) =>
      (a.position ?? 0) - (b.position ?? 0)
    )

    return NextResponse.json({
      owned: true,
      footprint,
      tiles: allTiles,
    })
  } catch (error) {
    console.error('Footprint lookup error:', error)
    return NextResponse.json({ owned: false })
  }
}

/**
 * PUT /api/footprint/[slug]
 *
 * Updates footprint settings. Requires auth + ownership.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const username = params.slug
    const supabase = createServerSupabaseClient()

    // Verify ownership
    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id')
      .eq('username', username)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { is_public, published, display_name, handle, bio, theme, grid_mode, background_url, background_blur, interactive } = body

    const updates: any = {}
    if (typeof is_public === 'boolean') updates.published = is_public
    if (typeof published === 'boolean') updates.published = published
    if (typeof display_name === 'string') updates.display_name = display_name
    if (typeof handle === 'string') updates.handle = handle
    if (typeof bio === 'string') updates.bio = bio
    if (typeof theme === 'string') updates.dimension = theme
    if (typeof grid_mode === 'string') updates.grid_mode = grid_mode
    if (typeof background_url === 'string') updates.background_url = background_url
    if (typeof background_blur === 'boolean') updates.background_blur = background_blur
    if (typeof interactive === 'boolean') updates.interactive = interactive

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('footprints')
      .update(updates)
      .eq('username', username)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    revalidatePath(`/${username}`)
    return NextResponse.json({ success: true, ...updates })
  } catch (error) {
    console.error('Update footprint error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
