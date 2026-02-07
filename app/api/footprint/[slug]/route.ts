import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/auth'

// Force dynamic rendering - never cache API responses
export const dynamic = 'force-dynamic'

/**
 * GET /api/footprint/[slug]
 *
 * Returns footprint + tiles (merged from library + links)
 * No auth - we're the only user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const username = params.slug
    const { searchParams } = new URL(request.url)
    const offset = parseInt(searchParams.get('offset') || '0')
    const limit = parseInt(searchParams.get('limit') || '24')

    const supabase = createServerSupabaseClient()

    // Get footprint by username
    const { data: footprint, error: footprintError } = await supabase
      .from('footprints')
      .select('*')
      .eq('username', username)
      .single()

    if (footprintError || !footprint) {
      console.log('[Footprint GET] Footprint not found:', footprintError?.message)
      return NextResponse.json({ owned: false })
    }

    console.log('[Footprint GET] Footprint found, serial_number:', footprint.serial_number)

    // User owns this footprint - fetch tiles from library + links
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

    // Merge and sort tiles by position - normalize structure for edit page
    const libraryTiles = (libraryResult.data || []).map(item => ({
      id: item.id,
      url: item.image_url,
      type: 'image',
      title: item.title || null,
      description: item.description || null,
      thumbnail_url: null,
      embed_html: null,
      position: item.position,
      source: 'library' as const,
      room_id: item.room_id || null,
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
    }))

    const allTiles = [...libraryTiles, ...linkTiles].sort((a, b) =>
      (a.position ?? 0) - (b.position ?? 0)
    )

    const totalCount = allTiles.length
    const tiles = allTiles.slice(offset, offset + limit)

    return NextResponse.json({
      owned: true,
      footprint,
      tiles,
      totalCount,
    })

  } catch (error) {
    console.error('Footprint lookup error:', error)
    return NextResponse.json({ owned: false })
  }
}

/**
 * PUT /api/footprint/[slug]
 *
 * Updates footprint settings (e.g., is_public).
 * No auth - we're the only user.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const username = params.slug

    const body = await request.json()
    const { is_public, display_name, handle, bio, theme, grid_mode, background_url, background_blur } = body

    // Build update object with only provided fields (map to real schema)
    const updates: any = {}
    if (typeof is_public === 'boolean') updates.published = is_public
    if (typeof display_name === 'string') updates.display_name = display_name
    if (typeof handle === 'string') updates.handle = handle
    if (typeof bio === 'string') updates.bio = bio
    if (typeof theme === 'string') updates.dimension = theme
    if (typeof grid_mode === 'string') updates.grid_mode = grid_mode
    if (typeof background_url === 'string') updates.background_url = background_url
    if (typeof background_blur === 'boolean') updates.background_blur = background_blur

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Update footprint
    const { error: updateError } = await supabase
      .from('footprints')
      .update(updates)
      .eq('username', username)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, ...updates })

  } catch (error) {
    console.error('Update footprint error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
