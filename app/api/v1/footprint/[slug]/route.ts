import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/v1/footprint/[slug]
 * 
 * Public API endpoint for retrieving footprint data.
 * 
 * This enables:
 * - Third-party integrations
 * - Custom displays on personal websites
 * - Portfolio aggregators
 * - Mobile apps
 * 
 * Rate limits: 100 requests per hour per IP (implemented via Vercel)
 * 
 * Response includes:
 * - Basic profile info (name, handle, bio, avatar)
 * - Serial number
 * - Theme
 * - Content items (with embed info)
 * - View count
 * 
 * Content can be limited with ?limit=N parameter.
 * 
 * We only return data for public footprints.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const includeEmbeds = searchParams.get('embeds') !== 'false'

    if (!slug) {
      return NextResponse.json(
        { error: 'Slug is required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Fetch footprint with content
    const { data: footprint, error } = await supabase
      .from('footprints')
      .select(`
        id,
        slug,
        name,
        icon,
        display_name,
        handle,
        bio,
        avatar_url,
        theme,
        view_count,
        created_at,
        users (serial_number)
      `)
      .eq('slug', slug)
      .eq('is_public', true)
      .single()

    if (error || !footprint) {
      return NextResponse.json(
        { error: 'Footprint not found' },
        { status: 404 }
      )
    }

    // Fetch content separately with limit
    const { data: content } = await supabase
      .from('content')
      .select(includeEmbeds 
        ? 'id, url, type, title, description, thumbnail_url, embed_html, external_id, position, created_at'
        : 'id, url, type, title, description, thumbnail_url, position, created_at'
      )
      .eq('footprint_id', footprint.id)
      .order('position', { ascending: true })
      .limit(limit)

    // Build the response
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'
    
    const response = {
      // API metadata
      _api: {
        version: '1.0',
        documentation: `${baseUrl}/api/docs`,
      },
      
      // Footprint data
      slug: footprint.slug,
      url: `${baseUrl}/${footprint.slug}`,
      
      profile: {
        name: footprint.display_name,
        handle: footprint.handle,
        bio: footprint.bio,
        avatar_url: footprint.avatar_url,
      },
      
      serial_number: footprint.users?.serial_number || 0,
      theme: footprint.theme || 'midnight',
      view_count: footprint.view_count || 0,
      created_at: footprint.created_at,
      
      // Room info
      room: {
        name: footprint.name,
        icon: footprint.icon,
      },
      
      // Content items
      content: {
        count: content?.length || 0,
        items: (content || []).map(item => ({
          id: item.id,
          url: item.url,
          type: item.type,
          title: item.title,
          description: item.description,
          thumbnail_url: item.thumbnail_url,
          embed_html: includeEmbeds ? item.embed_html : undefined,
          position: item.position,
          created_at: item.created_at,
        })),
      },
      
      // Useful links
      links: {
        qr_code: `${baseUrl}/api/qr?slug=${slug}`,
        embed_script: `${baseUrl}/api/embed?slug=${slug}`,
        og_image: `${baseUrl}/api/og?slug=${slug}`,
      },
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
        'Access-Control-Allow-Origin': '*', // CORS for browser requests
      },
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
