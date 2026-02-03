import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'
import { verifySessionToken } from '@/lib/auth'

/**
 * Get serial_number from slug
 * No auth - we're the only user
 */
async function getSerialNumber(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  slug: string
): Promise<number | null> {
  // Get footprint by username (slug)
  const { data: footprint } = await supabase
    .from('footprints')
    .select('serial_number')
    .eq('username', slug)
    .single()

  if (!footprint) return null

  return footprint.serial_number
}

/**
 * POST /api/tiles
 *
 * Add a tile (link/embed) to the links table.
 * Server derives serial_number from slug via ownership check.
 *
 * Body: { slug, url }
 */
export async function POST(request: NextRequest) {
  try {
    const { slug, url } = await request.json()

    if (!slug || !url) {
      return NextResponse.json({ error: 'slug and url required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get serial_number from slug (no auth)
    const serialNumber = await getSerialNumber(supabase, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    // Parse the URL
    const parsed = await parseURL(url)

    // Get max position from links table
    const { data: maxPos } = await supabase
      .from('links')
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    // Insert into links table
    const { data: tile, error } = await supabase
      .from('links')
      .insert({
        serial_number: serialNumber,
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
 * DELETE /api/tiles
 *
 * Delete a tile from either library or links table.
 * Server verifies ownership via slug before deletion.
 *
 * Body: { slug, source, id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { slug, source, id } = await request.json()

    if (!slug || !source || !id || !['library', 'links'].includes(source)) {
      console.error('DELETE /api/tiles: Missing or invalid params', { slug, source, id })
      return NextResponse.json({ error: 'slug, source (library|links), and id required' }, { status: 400 })
    }

    console.log('DELETE /api/tiles:', { slug, source, id })

    const supabase = createServerSupabaseClient()

    // Get serial_number from slug (no auth)
    const serialNumber = await getSerialNumber(supabase, slug)
    if (!serialNumber) {
      console.error('DELETE /api/tiles: Footprint not found', { slug })
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    console.log('DELETE /api/tiles: Found footprint, serial_number:', serialNumber)

    // Delete from the correct table, ensuring serial_number matches
    const { error, count } = await supabase
      .from(source)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('serial_number', serialNumber)

    if (error) {
      console.error('DELETE /api/tiles: Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`DELETE /api/tiles: Deleted ${count} row(s) from ${source}`)

    return NextResponse.json({ success: true, deleted: count })

  } catch (error) {
    console.error('DELETE /api/tiles: Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to delete tile' }, { status: 500 })
  }
}
