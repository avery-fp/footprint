import { NextRequest, NextResponse } from 'next/server'
import { parseURL } from '@/lib/parser'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/parse
 * 
 * Takes a URL, parses it, and optionally saves it to a footprint.
 * 
 * This is where the magic happens. Paste any URL → beautiful embed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, footprint_id, save } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Parse the URL
    const parsed = await parseURL(url)

    // If save is true and footprint_id is provided, save to database
    if (save && footprint_id) {
      const supabase = createServerSupabaseClient()

      // Get the max position for ordering
      const { data: maxPos } = await supabase
        .from('content')
        .select('position')
        .eq('footprint_id', footprint_id)
        .order('position', { ascending: false })
        .limit(1)
        .single()

      const nextPosition = (maxPos?.position || 0) + 1

      // Insert the content
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
        return NextResponse.json({ error: 'Failed to save content' }, { status: 500 })
      }

      return NextResponse.json({ parsed, saved: content })
    }

    // Just return the parsed data
    return NextResponse.json({ parsed })

  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json({ error: 'Failed to parse URL' }, { status: 500 })
  }
}
