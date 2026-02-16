import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'

/**
 * POST /api/aro/mint
 *
 * Programmatic room creator. Machine-to-machine auth via ARO_KEY.
 * Creates a room in a footprint, downloads images to Supabase Storage,
 * and adds embed tiles — all in one call.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      aro_key,
      slug,
      room_name,
      image_urls,
      embed_urls,
      wallpaper_url,
      theme_id,
      metadata,
    } = body

    // 1. Auth: verify ARO_KEY
    if (!aro_key || aro_key !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    // 2. Validate required fields
    if (!slug || !room_name) {
      return NextResponse.json(
        { error: 'slug and room_name required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(image_urls) || image_urls.length === 0) {
      return NextResponse.json(
        { error: 'image_urls array required (at least 1)' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // 3. Look up footprint by slug → get serial_number
    const { data: footprint } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json(
        { error: `Footprint '${slug}' not found` },
        { status: 404 }
      )
    }

    const serialNumber = footprint.serial_number

    // 4. Create room — get next position
    const { data: maxPosRoom } = await supabase
      .from('rooms')
      .select('position')
      .eq('serial_number', serialNumber)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const nextRoomPosition = (maxPosRoom?.position ?? -1) + 1

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        serial_number: serialNumber,
        name: room_name,
        position: nextRoomPosition,
      })
      .select()
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: roomError?.message || 'Failed to create room' },
        { status: 500 }
      )
    }

    let tileCount = 0

    // 5. Process image_urls: fetch → upload to storage → insert into library
    const imageResults = await Promise.allSettled(
      image_urls.map(async (imageUrl: string, index: number) => {
        try {
          const response = await fetch(imageUrl)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)

          const contentType = response.headers.get('content-type') || 'image/jpeg'
          const buffer = Buffer.from(await response.arrayBuffer())

          // Determine extension from content type
          const extMap: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
          }
          const ext = extMap[contentType] || 'jpg'
          const filename = `${serialNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('content')
            .upload(filename, buffer, { contentType, upsert: false })

          if (uploadError) throw uploadError

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('content')
            .getPublicUrl(filename)
          const publicUrl = urlData.publicUrl.replace(/[\n\r]/g, '')

          // Insert into library
          const { error: insertError } = await supabase.from('library').insert({
            serial_number: serialNumber,
            image_url: publicUrl,
            position: index,
            room_id: room.id,
          })

          if (insertError) throw insertError

          tileCount++
          return { url: publicUrl, status: 'ok' }
        } catch (err: any) {
          console.error(`Failed to process image ${imageUrl}:`, err.message)
          return { url: imageUrl, status: 'failed', error: err.message }
        }
      })
    )

    // 6. Process embed_urls (optional): parse → insert into links
    if (Array.isArray(embed_urls) && embed_urls.length > 0) {
      const embedResults = await Promise.allSettled(
        embed_urls.map(async (embedUrl: string, index: number) => {
          try {
            const parsed = await parseURL(embedUrl)

            const { error: insertError } = await supabase.from('links').insert({
              serial_number: serialNumber,
              url: parsed.url,
              platform: parsed.type,
              title: parsed.title,
              metadata: {
                description: parsed.description,
                embed_html: parsed.embed_html,
              },
              thumbnail: parsed.thumbnail_url,
              position: image_urls.length + index,
              room_id: room.id,
            })

            if (insertError) throw insertError

            tileCount++
            return { url: parsed.url, type: parsed.type, status: 'ok' }
          } catch (err: any) {
            console.error(`Failed to process embed ${embedUrl}:`, err.message)
            return { url: embedUrl, status: 'failed', error: err.message }
          }
        })
      )
    }

    // 7. Handle wallpaper (optional): upload and store URL
    if (wallpaper_url) {
      try {
        const wpResponse = await fetch(wallpaper_url)
        if (wpResponse.ok) {
          const wpContentType =
            wpResponse.headers.get('content-type') || 'image/jpeg'
          const wpBuffer = Buffer.from(await wpResponse.arrayBuffer())
          const wpExt =
            wpContentType === 'image/png'
              ? 'png'
              : wpContentType === 'image/webp'
              ? 'webp'
              : 'jpg'
          const wpFilename = `${serialNumber}/wallpaper-${room.id}.${wpExt}`

          await supabase.storage
            .from('content')
            .upload(wpFilename, wpBuffer, {
              contentType: wpContentType,
              upsert: true,
            })

          const { data: wpUrlData } = supabase.storage
            .from('content')
            .getPublicUrl(wpFilename)
          const wpPublicUrl = wpUrlData.publicUrl.replace(/[\n\r]/g, '')

          // Store wallpaper URL on the room (if column exists) or as metadata
          await supabase
            .from('rooms')
            .update({ wallpaper_url: wpPublicUrl })
            .eq('id', room.id)
        }
      } catch (err: any) {
        console.error('Wallpaper upload failed:', err.message)
      }
    }

    // 8. Store metadata if provided
    if (metadata) {
      await supabase
        .from('rooms')
        .update({
          aro_metadata: {
            source: metadata.source || 'aro',
            cluster: metadata.cluster || null,
            batch_id: metadata.batch_id || null,
          },
        })
        .eq('id', room.id)
    }

    // Revalidate public page
    revalidatePath(`/${slug}`)

    return NextResponse.json({
      room_id: room.id,
      room_url: `https://footprint.onl/${slug}`,
      tile_count: tileCount,
      serial_number: serialNumber,
    })
  } catch (error: any) {
    console.error('ARO mint error:', error)
    return NextResponse.json(
      { error: error?.message || 'Mint failed' },
      { status: 500 }
    )
  }
}
