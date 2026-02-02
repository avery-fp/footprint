import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'
import { verifySessionToken } from '@/lib/auth'

/**
 * Verify ownership and get serial_number from slug
 * Returns serial_number if user owns the footprint, null otherwise
 *
 * Ownership is determined via purchases table:
 * - Get user's email
 * - Get footprint's serial_number
 * - Check if purchase exists for that email + serial_number
 */
async function verifyOwnership(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  slug: string
): Promise<number | null> {
  // Get user's email
  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single()

  if (!user) return null

  // Get footprint by username (slug)
  const { data: footprint } = await supabase
    .from('footprints')
    .select('serial_number')
    .eq('username', slug)
    .single()

  if (!footprint) return null

  // Check ownership via purchases table
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('email', user.email)
    .eq('serial_number', footprint.serial_number)
    .limit(1)
    .single()

  if (!purchase) return null

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
    // Read session cookie directly
    const sessionCookie = request.cookies.get('session')?.value
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify session and get userId
    const session = await verifySessionToken(sessionCookie)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug, url } = await request.json()

    if (!slug || !url) {
      return NextResponse.json({ error: 'slug and url required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Verify ownership and get serial_number
    const serialNumber = await verifyOwnership(supabase, session.userId, slug)
    if (!serialNumber) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
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
    // Read session cookie directly
    const sessionCookie = request.cookies.get('session')?.value
    if (!sessionCookie) {
      console.error('DELETE /api/tiles: No session cookie')
      return NextResponse.json({ error: 'Unauthorized - No session cookie' }, { status: 401 })
    }

    // Verify session and get userId
    const session = await verifySessionToken(sessionCookie)
    if (!session) {
      console.error('DELETE /api/tiles: Invalid session token')
      return NextResponse.json({ error: 'Unauthorized - Invalid session' }, { status: 401 })
    }

    const { slug, source, id } = await request.json()

    if (!slug || !source || !id || !['library', 'links'].includes(source)) {
      console.error('DELETE /api/tiles: Missing or invalid params', { slug, source, id })
      return NextResponse.json({ error: 'slug, source (library|links), and id required' }, { status: 400 })
    }

    console.log('DELETE /api/tiles:', { userId: session.userId, slug, source, id })

    const supabase = createServerSupabaseClient()

    // Verify ownership and get serial_number
    const serialNumber = await verifyOwnership(supabase, session.userId, slug)
    if (!serialNumber) {
      console.error('DELETE /api/tiles: Not authorized', { userId: session.userId, slug })
      return NextResponse.json({ error: 'Not authorized - ownership verification failed' }, { status: 403 })
    }

    console.log('DELETE /api/tiles: Ownership verified, serial_number:', serialNumber)

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
