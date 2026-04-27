import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import { mediaTypeFromUrl } from '@/lib/media'

// Lightweight endpoint: register a file already uploaded to Supabase Storage.
// Used by client-side video uploads that bypass Vercel's body limit.
export async function POST(request: NextRequest) {
  try {
    const { slug, url, room_id, aspect, content_type, caption, caption_hidden } = await request.json()

    if (!slug || !url) {
      return NextResponse.json({ error: 'slug and url required' }, { status: 400 })
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    const serialNumber = footprint.serial_number

    const { data: maxPos } = await supabase
      .from('library')
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxPos?.position ?? -1) + 1

    const { data: tile, error: insertError } = await supabase
      .from('library')
      .insert({
        serial_number: serialNumber,
        image_url: url,
        position: nextPosition,
        room_id: room_id || null,
        ...(aspect ? { aspect } : {}),
        ...(caption ? { caption } : {}),
        ...(caption_hidden !== undefined ? { caption_hidden: !!caption_hidden } : {}),
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to register upload' }, { status: 500 })
    }

    revalidatePath(`/${slug}`)

    const canonicalType = mediaTypeFromUrl(url || '', tile.media_kind)

    return NextResponse.json({
      tile: {
        id: tile.id,
        url: tile.image_url,
        type: canonicalType,
        title: null,
        description: null,
        thumbnail_url: null,
        embed_html: null,
        position: tile.position,
        source: 'library',
        room_id: tile.room_id || null,
        aspect: tile.aspect || aspect || null,
        caption: tile.caption || null,
        caption_hidden: tile.caption_hidden ?? false,
      }
    })
  } catch (error) {
    console.error('Register upload error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
