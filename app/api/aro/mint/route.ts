import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { parseURL } from '@/lib/parser'

/**
 * POST /api/aro/mint
 *
 * Creates a NEW standalone footprint page at footprint.onl/{slug}.
 * Each mint = new serial_number + new user + new footprint + one room + content.
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
      theme_id,
      display_name,
      bio,
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

    // 3. Check slug not already taken
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

    // 4. Claim a serial number
    const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
    if (serialError || !serialData) {
      return NextResponse.json(
        { error: 'Failed to claim serial number' },
        { status: 500 }
      )
    }

    const serialNumber = serialData as number

    // 5. Create or reuse synthetic user (upsert for retry safety)
    const aroEmail = `aro+${slug}@footprint.onl`

    const { data: existingUser } = await supabase
      .from('users')
      .select('id, serial_number')
      .eq('email', aroEmail)
      .single()

    let userId: string
    let effectiveSerial = serialNumber

    if (existingUser) {
      // Reuse existing user from a previous partial attempt
      userId = existingUser.id
      effectiveSerial = existingUser.serial_number
    } else {
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          email: aroEmail,
          serial_number: serialNumber,
        })
        .select()
        .single()

      if (userError || !newUser) {
        return NextResponse.json(
          { error: userError?.message || 'Failed to create user' },
          { status: 500 }
        )
      }
      userId = newUser.id
    }

    // 6. Create the footprint — standalone page at footprint.onl/{slug}
    //    Columns: serial_number, username, display_name, dimension, bio,
    //    published, email (18 actual columns, no user_id/is_primary/is_public/name)
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
      })
      .select()
      .single()

    if (fpError || !footprint) {
      return NextResponse.json(
        { error: fpError?.message || 'Failed to create footprint' },
        { status: 500 }
      )
    }

    // 7. Create one room inside the footprint
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        serial_number: effectiveSerial,
        name: room_name,
        position: 0,
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

    // 8. Process image_urls: fetch → upload to storage → insert into library
    await Promise.allSettled(
      image_urls.map(async (imageUrl: string, index: number) => {
        try {
          const response = await fetch(imageUrl)
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

          const { error: insertError } = await supabase.from('library').insert({
            serial_number: effectiveSerial,
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

    // 9. Process embed_urls (optional): parse → insert into links
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

    // 10. Handle wallpaper (optional)
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
          const wpFilename = `${effectiveSerial}/wallpaper-${room.id}.${wpExt}`

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

          await supabase
            .from('rooms')
            .update({ wallpaper_url: wpPublicUrl })
            .eq('id', room.id)
        }
      } catch (err: any) {
        console.error('Wallpaper upload failed:', err.message)
      }
    }

    // 11. Store metadata if provided
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

    // Revalidate the new page
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
