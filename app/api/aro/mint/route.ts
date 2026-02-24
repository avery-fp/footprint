import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'

/**
 * Tile size rhythm pattern — creates visual variety like a hand-curated room.
 * Maps tile index → size (1=standard, 2=double/hero).
 * Pattern: hero, small, small, hero, small, small, small, ...
 */
function getTileSize(index: number): number {
  if (index === 0) return 2  // First tile: hero
  if (index === 3) return 2  // 4th tile: hero
  return 1                    // Rest: standard
}

/**
 * POST /api/aro/mint
 *
 * Creates a NEW standalone footprint page at footprint.onl/{slug}.
 * Each mint = new serial + user + footprint + room + styled content.
 *
 * Produces pages that look hand-curated: wallpaper backgrounds,
 * music embeds, varied tile sizes, theme styling — all automatic.
 *
 * Machine-to-machine auth via ARO_KEY.
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
      music_url,
      theme_id,
      display_name,
      bio,
      metadata,
    } = body

    // 1. Auth
    if (!aro_key || aro_key !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    // 2. Validate
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

    // 3. Check slug availability
    const { data: existing } = await supabase
      .from('footprints')
      .select('serial_number')
      .eq('username', slug)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: `Slug '${slug}' is already taken` },
        { status: 409 }
      )
    }

    // 4. Claim serial
    const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
    if (serialError || !serialData) {
      return NextResponse.json(
        { error: 'Failed to claim serial number' },
        { status: 500 }
      )
    }

    const serialNumber = serialData as number

    // 5. Create or reuse user (upsert for retry safety)
    const aroEmail = `aro+${slug}@footprint.onl`

    const { data: existingUser } = await supabase
      .from('users')
      .select('id, serial_number')
      .eq('email', aroEmail)
      .single()

    let effectiveSerial = serialNumber

    if (existingUser) {
      effectiveSerial = existingUser.serial_number
    } else {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({ email: aroEmail, serial_number: serialNumber })
        .select()
        .single()

      if (userError || !newUser) {
        return NextResponse.json(
          { error: userError?.message || 'Failed to create user' },
          { status: 500 }
        )
      }
    }

    // 6. Upload wallpaper to storage (if provided)
    let backgroundUrl: string | null = null

    if (wallpaper_url) {
      try {
        const wpResponse = await fetch(wallpaper_url, { signal: AbortSignal.timeout(30000) })
        if (wpResponse.ok) {
          const wpContentType = wpResponse.headers.get('content-type') || 'image/jpeg'
          const wpBuffer = Buffer.from(await wpResponse.arrayBuffer())
          const wpExt = wpContentType === 'image/png' ? 'png'
            : wpContentType === 'image/webp' ? 'webp' : 'jpg'
          const wpFilename = `${effectiveSerial}/wallpaper-${Date.now()}.${wpExt}`

          await supabase.storage
            .from('content')
            .upload(wpFilename, wpBuffer, { contentType: wpContentType, upsert: true })

          const { data: wpUrlData } = supabase.storage
            .from('content')
            .getPublicUrl(wpFilename)
          backgroundUrl = wpUrlData.publicUrl.replace(/[\n\r]/g, '')
        }
      } catch (err: any) {
        console.error('Wallpaper upload failed:', err.message)
      }
    }

    // 7. Create footprint with background + theme
    const { data: footprint, error: fpError } = await supabase
      .from('footprints')
      .insert({
        serial_number: effectiveSerial,
        username: slug,
        display_name: display_name || room_name,
        bio: bio || null,
        dimension: theme_id || 'midnight',
        published: true,
        email: aroEmail,
        background_url: backgroundUrl,
        background_blur: true,
      })
      .select()
      .single()

    if (fpError || !footprint) {
      return NextResponse.json(
        { error: fpError?.message || 'Failed to create footprint' },
        { status: 500 }
      )
    }

    // 8. Create room with wallpaper + music
    const roomInsert: Record<string, any> = {
      serial_number: effectiveSerial,
      name: room_name,
      position: 0,
    }
    if (backgroundUrl) roomInsert.wallpaper_url = backgroundUrl
    if (music_url) roomInsert.music_url = music_url

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert(roomInsert)
      .select()
      .single()

    if (roomError || !room) {
      return NextResponse.json(
        { error: roomError?.message || 'Failed to create room' },
        { status: 500 }
      )
    }

    // 9. Process images with size rhythm
    let tileCount = 0
    let firstImageUrl: string | null = null

    const imageResults = await Promise.allSettled(
      image_urls.map(async (imageUrl: string, index: number) => {
        try {
          const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)

          const contentType = response.headers.get('content-type') || 'image/jpeg'
          const buffer = Buffer.from(await response.arrayBuffer())

          const extMap: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
          }
          const ext = extMap[contentType] || 'jpg'
          const filename = `${effectiveSerial}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

          const { error: uploadError } = await supabase.storage
            .from('content')
            .upload(filename, buffer, { contentType, upsert: false })

          if (uploadError) throw uploadError

          const { data: urlData } = supabase.storage
            .from('content')
            .getPublicUrl(filename)
          const publicUrl = urlData.publicUrl.replace(/[\n\r]/g, '')

          // Track first image for default background
          if (index === 0) firstImageUrl = publicUrl

          const { error: insertError } = await supabase.from('library').insert({
            serial_number: effectiveSerial,
            image_url: publicUrl,
            position: index,
            room_id: room.id,
            size: getTileSize(index),
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

    // 10. Default background: use first image if no wallpaper was provided
    if (!backgroundUrl && firstImageUrl) {
      await supabase
        .from('footprints')
        .update({ background_url: firstImageUrl, background_blur: true })
        .eq('serial_number', effectiveSerial)
    }

    // 11. Process embed_urls as link tiles
    if (Array.isArray(embed_urls) && embed_urls.length > 0) {
      await Promise.allSettled(
        embed_urls.map(async (embedUrl: string, index: number) => {
          try {
            const parsed = await parseURL(embedUrl)

            const { error: insertError } = await supabase.from('links').insert({
              serial_number: effectiveSerial,
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
              size: 1,
            })

            if (insertError) throw insertError

            tileCount++
          } catch (err: any) {
            console.error(`Failed to process embed ${embedUrl}:`, err.message)
          }
        })
      )
    }

    // 12. Process music_url as a link tile (Spotify/SoundCloud/Apple Music)
    if (music_url) {
      try {
        const parsed = await parseURL(music_url)

        await supabase.from('links').insert({
          serial_number: effectiveSerial,
          url: parsed.url,
          platform: parsed.type,
          title: parsed.title,
          metadata: {
            description: parsed.description,
            embed_html: parsed.embed_html,
          },
          thumbnail: parsed.thumbnail_url,
          position: image_urls.length + (embed_urls?.length || 0),
          room_id: room.id,
          size: 2,
        })

        tileCount++
      } catch (err: any) {
        console.error('Failed to process music_url:', err.message)
      }
    }

    // 13. Store metadata on room if provided
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

    revalidatePath(`/${slug}`)

    return NextResponse.json({
      slug,
      room_id: room.id,
      room_url: `https://footprint.onl/${slug}`,
      tile_count: tileCount,
      serial_number: effectiveSerial,
    })
  } catch (error: any) {
    console.error('ARO mint error:', error)
    return NextResponse.json(
      { error: error?.message || 'Mint failed' },
      { status: 500 }
    )
  }
}
