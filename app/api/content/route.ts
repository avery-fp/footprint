import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'
import { getUserIdFromRequest } from '@/lib/auth'
import { contentPostSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('*', '/api/content')

/**
 * GET /api/content?footprint_id=xxx
 * 
 * Fetches all content for a footprint, ordered by position.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const footprintId = searchParams.get('footprint_id')

    if (!footprintId) {
      return NextResponse.json({ error: 'footprint_id required' }, { status: 400 })
    }

    // Require authentication — prevents IDOR on unpublished footprints
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // Verify user owns this footprint
    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id')
      .eq('id', footprintId)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Not your footprint' }, { status: 403 })
    }

    const { data: content, error } = await supabase
      .from('content')
      .select('*')
      .eq('footprint_id', footprintId)
      .order('position', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 })
    }

    return NextResponse.json({ content })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 })
  }
}

/**
 * POST /api/content
 * 
 * Creates new content from a URL.
 * 
 * The magic happens here:
 * 1. User pastes a URL
 * 2. We parse it to determine type (YouTube, Spotify, etc.)
 * 3. Extract metadata (title, thumbnail, embed code)
 * 4. Save to database
 * 5. Return the beautifully parsed content
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(contentPostSchema, body)
    if (!v.success) return v.response
    const { url, footprint_id } = v.data

    // Verify user owns this footprint
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // Check footprint ownership
    const { data: footprint } = await supabase
      .from('footprints')
      .select('user_id')
      .eq('id', footprint_id)
      .single()

    if (!footprint || footprint.user_id !== userId) {
      return NextResponse.json({ error: 'Not your footprint' }, { status: 403 })
    }

    // Parse the URL
    const parsed = await parseURL(url)

    // Get max position
    const { data: maxPos } = await supabase
      .from('content')
      .select('position')
      .eq('footprint_id', footprint_id)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    // Insert content
    const { data: content, error } = await supabase
      .from('content')
      .insert({
        footprint_id,
        url: parsed.url,
        type: parsed.type,
        title: parsed.title,
        description: parsed.description,
        thumbnail_url: parsed.thumbnail_url,
        embed_html: parsed.embed_html,
        external_id: parsed.external_id,
        position: nextPosition,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    return NextResponse.json({ content })

  } catch (error) {
    log.error({ err: error }, 'Content creation failed')
    return NextResponse.json({ error: 'Failed to create content' }, { status: 500 })
  }
}

/**
 * DELETE /api/content?id=xxx
 * 
 * Deletes a content item.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const contentId = searchParams.get('id')

    if (!contentId) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // Get content and verify ownership through footprint
    const { data: content } = await supabase
      .from('content')
      .select('footprint_id, footprints(user_id)')
      .eq('id', contentId)
      .single()

    if (!content || (content.footprints as any)?.user_id !== userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Delete it
    const { error } = await supabase
      .from('content')
      .delete()
      .eq('id', contentId)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 })
  }
}
