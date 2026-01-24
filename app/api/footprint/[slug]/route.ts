import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/footprint/[slug]
 *
 * Checks if authenticated user owns this footprint (by username).
 * If yes: returns footprint + tiles (merged from library + links)
 * If no: returns { owned: false } with NO data
 *
 * Ownership is determined by matching serial_number:
 * - users.serial_number (from x-user-id)
 * - footprints.serial_number (from username lookup)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const username = params.slug
    const userId = request.headers.get('x-user-id')

    // Not authenticated - can't own anything
    if (!userId) {
      return NextResponse.json({ owned: false })
    }

    const supabase = createServerSupabaseClient()

    // Get user's serial_number
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('serial_number')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ owned: false })
    }

    // Get footprint by username
    const { data: footprint, error: footprintError } = await supabase
      .from('footprints')
      .select('*')
      .eq('username', username)
      .single()

    if (footprintError || !footprint) {
      return NextResponse.json({ owned: false })
    }

    // Check ownership via serial_number match
    if (user.serial_number !== footprint.serial_number) {
      return NextResponse.json({ owned: false })
    }

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

    // Merge and sort tiles by position
    const libraryTiles = (libraryResult.data || []).map(item => ({
      ...item,
      source: 'library' as const,
    }))
    const linkTiles = (linksResult.data || []).map(item => ({
      ...item,
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
