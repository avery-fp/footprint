import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/footprint/[slug]
 *
 * Checks if authenticated user owns this slug.
 * If yes: returns footprint + content
 * If no: returns { owned: false }
 *
 * Used by editor to determine data source (DB vs localStorage)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params
    const userId = request.headers.get('x-user-id')

    // Not authenticated - can't own anything
    if (!userId) {
      return NextResponse.json({ owned: false })
    }

    const supabase = createServerSupabaseClient()

    // Check if footprint exists and user owns it
    const { data: footprint, error } = await supabase
      .from('footprints')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error || !footprint) {
      return NextResponse.json({ owned: false })
    }

    if (footprint.user_id !== userId) {
      return NextResponse.json({ owned: false })
    }

    // User owns this footprint - fetch content too
    const { data: content } = await supabase
      .from('content')
      .select('*')
      .eq('footprint_id', footprint.id)
      .order('position', { ascending: true })

    return NextResponse.json({
      owned: true,
      footprint,
      content: content || [],
    })

  } catch (error) {
    console.error('Footprint lookup error:', error)
    return NextResponse.json({ owned: false })
  }
}
