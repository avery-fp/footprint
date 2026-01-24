import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'

/**
 * POST /api/tiles
 *
 * Add a tile (link/embed) to the links table.
 * Images go to library table via upload endpoint.
 *
 * Body: { serial_number, url }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { serial_number, url } = await request.json()

    if (!serial_number || !url) {
      return NextResponse.json({ error: 'serial_number and url required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership: user's serial_number must match
    const { data: user } = await supabase
      .from('users')
      .select('serial_number')
      .eq('id', userId)
      .single()

    if (!user || user.serial_number !== serial_number) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Parse the URL
    const parsed = await parseURL(url)

    // Get max position from links table
    const { data: maxPos } = await supabase
      .from('links')
      .select('position')
      .eq('serial_number', serial_number)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    // Insert into links table
    const { data: tile, error } = await supabase
      .from('links')
      .insert({
        serial_number,
        url: parsed.url,
        type: parsed.type,
        title: parsed.title,
        description: parsed.description,
        thumbnail_url: parsed.thumbnail_url,
        embed_html: parsed.embed_html,
        position: nextPosition,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ tile: { ...tile, source: 'links' } })

  } catch (error) {
    console.error('Add tile error:', error)
    return NextResponse.json({ error: 'Failed to add tile' }, { status: 500 })
  }
}

/**
 * DELETE /api/tiles?id=xxx&source=library|links
 *
 * Delete a tile from either library or links table.
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tileId = searchParams.get('id')
    const source = searchParams.get('source') as 'library' | 'links'

    if (!tileId || !source || !['library', 'links'].includes(source)) {
      return NextResponse.json({ error: 'id and source (library|links) required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get user's serial_number
    const { data: user } = await supabase
      .from('users')
      .select('serial_number')
      .eq('id', userId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify ownership by checking tile's serial_number
    const { data: tile } = await supabase
      .from(source)
      .select('serial_number')
      .eq('id', tileId)
      .single()

    if (!tile || tile.serial_number !== user.serial_number) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Delete the tile
    const { error } = await supabase
      .from(source)
      .delete()
      .eq('id', tileId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete tile error:', error)
    return NextResponse.json({ error: 'Failed to delete tile' }, { status: 500 })
  }
}
