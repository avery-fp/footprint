import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getFootprintDisplayTitle } from '@/lib/footprint'

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
        username,
        name,
        icon,
        display_title,
        display_name,
        handle,
        bio,
        avatar_url,
        dimension,
        serial_number,
        view_count,
        created_at
      `)
      .eq('username', slug)
      .eq('published', true)
      .single()

    if (error || !footprint) {
      return NextResponse.json(
        { error: 'Footprint not found' },
        { status: 404 }
      )
    }

    // Fetch tiles from library + links (the real schema)
    const serial = footprint.serial_number
    const [{ data: images }, { data: links }] = await Promise.all([
      supabase.from('library').select('id, image_url, title, position, created_at')
        .eq('serial_number', serial).order('position').limit(limit),
      supabase.from('links').select('id, url, platform, title, thumbnail, metadata, position, created_at')
        .eq('serial_number', serial).order('position').limit(limit),
    ])

    const content = [
      ...(images || []).map((img: any) => ({
        id: img.id, url: img.image_url, type: 'image', title: img.title,
        description: null, thumbnail_url: null,
        embed_html: includeEmbeds ? null : undefined,
        position: img.position, created_at: img.created_at,
      })),
      ...(links || []).map((link: any) => ({
        id: link.id, url: link.url, type: link.platform, title: link.title,
        description: link.metadata?.description || null, thumbnail_url: link.thumbnail,
        embed_html: includeEmbeds ? (link.metadata?.embed_html || null) : undefined,
        position: link.position, created_at: link.created_at,
      })),
    ].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).slice(0, limit)

    // Build the response
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'
    
    const response = {
      // API metadata
      _api: {
        version: '1.0',
        documentation: `${baseUrl}/api/docs`,
      },
      
      // Footprint data
      slug: footprint.username,
      url: `${baseUrl}/${footprint.username}`,
      
      profile: {
        name: getFootprintDisplayTitle(footprint),
        handle: footprint.handle,
        bio: footprint.bio,
        avatar_url: footprint.avatar_url,
      },
      
      serial_number: serial,
      theme: footprint.dimension || 'midnight',
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
