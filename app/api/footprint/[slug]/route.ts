import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/auth'

// Force dynamic rendering - never cache API responses
export const dynamic = 'force-dynamic'

/**
 * GET /api/footprint/[slug]
 *
 * Checks if authenticated user owns this footprint (by username).
 * If yes: returns footprint + tiles (merged from library + links)
 * If no: returns { owned: false } with NO data
 *
 * Ownership is determined by comparing serial numbers:
 * - Get user's serial_number from session
 * - Get footprint's serial_number
 * - Check if they match
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const username = params.slug
    console.log('[Ownership Check] Starting for slug:', username)

    // Read session cookie directly (don't rely on middleware)
    const sessionCookie = request.cookies.get('session')?.value

    // Not authenticated - can't own anything
    if (!sessionCookie) {
      console.log('[Ownership Check] No session cookie found')
      return NextResponse.json({ owned: false })
    }

    console.log('[Ownership Check] Session cookie exists')

    // Verify session and get userId
    const session = await verifySessionToken(sessionCookie)
    if (!session) {
      console.log('[Ownership Check] Invalid session token')
      return NextResponse.json({ owned: false })
    }

    console.log('[Ownership Check] Session valid, userId:', session.userId, 'email:', session.email)

    const supabase = createServerSupabaseClient()

    // Get user's email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', session.userId)
      .single()

    if (userError || !user) {
      console.log('[Ownership Check] User not found in DB:', userError?.message)
      return NextResponse.json({ owned: false })
    }

    console.log('[Ownership Check] User found, email:', user.email)

    // Get footprint by username
    const { data: footprint, error: footprintError } = await supabase
      .from('footprints')
      .select('*')
      .eq('username', username)
      .single()

    if (footprintError || !footprint) {
      console.log('[Ownership Check] Footprint not found:', footprintError?.message)
      return NextResponse.json({ owned: false })
    }

    console.log('[Ownership Check] Footprint found, serial_number:', footprint.serial_number)

    // Check ownership - footprint must belong to this user
    // Compare footprint.serial_number with user's serial_number from users table
    const { data: userData } = await supabase
      .from('users')
      .select('serial_number')
      .eq('id', session.userId)
      .single()

    if (!userData || userData.serial_number !== footprint.serial_number) {
      console.log('[Ownership Check] User does not own this footprint')
      console.log('[Ownership Check] User serial:', userData?.serial_number, 'Footprint serial:', footprint.serial_number)
      return NextResponse.json({ owned: false })
    }

    console.log('[Ownership Check] Serial numbers match! User owns this footprint')

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
    }))

    const tiles = [...libraryTiles, ...linkTiles].sort((a, b) =>
      (a.position ?? 0) - (b.position ?? 0)
    )

    return NextResponse.json({
      owned: true,
      footprint,
      tiles,
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
 * Requires ownership.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const username = params.slug

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

    const body = await request.json()
    const { is_public, display_name, handle, bio, theme, grid_mode } = body

    // Build update object with only provided fields (map to real schema)
    const updates: any = {}
    if (typeof is_public === 'boolean') updates.published = is_public
    if (typeof display_name === 'string') updates.display_name = display_name
    if (typeof handle === 'string') updates.handle = handle
    if (typeof bio === 'string') updates.bio = bio
    if (typeof theme === 'string') updates.dimension = theme
    if (typeof grid_mode === 'string') updates.grid_mode = grid_mode

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get user's serial_number
    const { data: user } = await supabase
      .from('users')
      .select('serial_number')
      .eq('id', session.userId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get footprint by username
    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', username)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    // Verify ownership - compare serial numbers
    if (user.serial_number !== footprint.serial_number) {
      return NextResponse.json({ error: 'Not your footprint' }, { status: 403 })
    }

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
