import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdminOrMachine } from '@/src/aro/lib/auth'
import { ImageResponse } from '@vercel/og'
import { getFootprintDisplayTitle } from '@/lib/footprint'

/**
 * POST /api/aro/screenshot
 *
 * Multi-format screenshot renderer. Uses @vercel/og (satori) to render
 * room data as static images — no headless browser needed.
 *
 * Generates screenshots in 4 aspect ratios for native platform posting.
 * Stores them in Supabase Storage for caching and reuse.
 */

// Format dimensions (width x height in pixels)
const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1x1': { width: 1080, height: 1080 },
  '4x5': { width: 1080, height: 1350 },
  '16x9': { width: 1920, height: 1080 },
  '9x16': { width: 1080, height: 1920 },
}

const VALID_FORMATS = Object.keys(FORMAT_DIMENSIONS)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { slug, room_name, formats } = body

    // 1. Auth: admin session cookie OR Authorization: Bearer CRON_SECRET/ARO_KEY
    const auth = await requireAdminOrMachine(request)
    if (auth instanceof NextResponse) return auth

    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 })
    }

    // Validate formats
    const requestedFormats = Array.isArray(formats)
      ? formats.filter((f: string) => VALID_FORMATS.includes(f))
      : VALID_FORMATS

    if (requestedFormats.length === 0) {
      return NextResponse.json(
        { error: `Invalid formats. Valid: ${VALID_FORMATS.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // 2. Get footprint data
    const { data: footprint } = await supabase
      .from('footprints')
      .select('*')
      .eq('username', slug)
      .single()

    if (!footprint) {
      return NextResponse.json(
        { error: `Footprint '${slug}' not found` },
        { status: 404 }
      )
    }

    const serialNumber = footprint.serial_number

    // 3. Get room (specific or first visible)
    let roomQuery = supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', serialNumber)
      .neq('hidden', true)
      .order('position')

    if (room_name) {
      roomQuery = roomQuery.eq('name', room_name)
    }

    const { data: rooms } = await roomQuery.limit(1)
    const room = rooms?.[0]

    // 4. Get content for the room (or all content if no rooms)
    const [{ data: images }, { data: links }] = await Promise.all([
      room
        ? supabase
            .from('library')
            .select('*')
            .eq('serial_number', serialNumber)
            .eq('room_id', room.id)
            .order('position')
            .limit(12)
        : supabase
            .from('library')
            .select('*')
            .eq('serial_number', serialNumber)
            .order('position')
            .limit(12),
      room
        ? supabase
            .from('links')
            .select('*')
            .eq('serial_number', serialNumber)
            .eq('room_id', room.id)
            .order('position')
            .limit(6)
        : supabase
            .from('links')
            .select('*')
            .eq('serial_number', serialNumber)
            .order('position')
            .limit(6),
    ])

    // Merge content
    const content = [
      ...(images || []).map((img: any) => ({
        type: 'image' as const,
        url: img.image_url,
        title: null,
        position: img.position,
      })),
      ...(links || []).map((link: any) => ({
        type: link.platform as string,
        url: link.url,
        title: link.title,
        thumbnail: link.thumbnail,
        position: link.position,
      })),
    ].sort((a, b) => a.position - b.position)

    // 5. Generate screenshots for each format
    const screenshots: Record<string, string> = {}

    for (const format of requestedFormats) {
      const { width, height } = FORMAT_DIMENSIONS[format]

      // Render the image using @vercel/og (satori under the hood)
      const imageResponse = new ImageResponse(
        renderRoom({
          footprint,
          room,
          content,
          format,
          width,
          height,
        }),
        { width, height }
      )

      // Convert to buffer
      const arrayBuffer = await imageResponse.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Upload to Supabase Storage
      const storagePath = `aro/${serialNumber}/${room?.id || 'default'}/${format}.png`

      await supabase.storage
        .from('content')
        .upload(storagePath, buffer, {
          contentType: 'image/png',
          upsert: true,
        })

      const { data: urlData } = supabase.storage
        .from('content')
        .getPublicUrl(storagePath)

      screenshots[format] = urlData.publicUrl.replace(/[\n\r]/g, '')
    }

    return NextResponse.json({ screenshots })
  } catch (error: any) {
    console.error('ARO screenshot error:', error)
    return NextResponse.json(
      { error: error?.message || 'Screenshot generation failed' },
      { status: 500 }
    )
  }
}

/**
 * Render a room as a JSX element for satori/ImageResponse.
 * Returns a React element that satori can render to SVG → PNG.
 */
function renderRoom({
  footprint,
  room,
  content,
  format,
  width,
  height,
}: {
  footprint: any
  room: any
  content: any[]
  format: string
  width: number
  height: number
}) {
  const displayName = getFootprintDisplayTitle(footprint) || footprint.username
  const serial = String(footprint.serial_number).padStart(4, '0')
  const roomName = room?.name || 'everything'

  // Calculate grid layout based on format
  const isVertical = format === '9x16' || format === '4x5'
  const cols = isVertical ? 2 : 3
  const imageItems = content.filter((c) => c.type === 'image').slice(0, isVertical ? 6 : 9)
  const linkItems = content.filter((c) => c.type !== 'image').slice(0, 3)

  // Tile size based on format
  const padding = 40
  const gap = 12
  const availableWidth = width - padding * 2
  const tileSize = Math.floor((availableWidth - gap * (cols - 1)) / cols)

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(15,10,40,1) 0%, rgba(5,5,15,1) 70%, rgba(0,0,0,1) 100%)',
        padding: `${padding}px`,
        fontFamily: 'system-ui, sans-serif',
        color: '#F5F5F5',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: '32px',
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: '16px',
              color: 'rgba(255,255,255,0.5)',
              marginTop: '4px',
            }}
          >
            #{serial} · {roomName}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: '14px',
            color: 'rgba(255,255,255,0.4)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            padding: '8px 16px',
          }}
        >
          footprint.onl/{footprint.username}
        </div>
      </div>

      {/* Image grid */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${gap}px`,
          flex: 1,
        }}
      >
        {imageItems.map((item, i) => (
          <div
            key={i}
            style={{
              width: `${tileSize}px`,
              height: `${tileSize}px`,
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt=""
              width={tileSize}
              height={tileSize}
              style={{
                objectFit: 'cover',
                width: '100%',
                height: '100%',
              }}
            />
          </div>
        ))}
      </div>

      {/* Link tiles row */}
      {linkItems.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: `${gap}px`,
            marginTop: `${gap}px`,
          }}
        >
          {linkItems.map((item, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: '64px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              <span style={{ marginRight: '8px' }}>
                {item.type === 'spotify'
                  ? '♫'
                  : item.type === 'youtube'
                  ? '▶'
                  : item.type === 'twitter'
                  ? '𝕏'
                  : '◎'}
              </span>
              {item.title || item.type}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          footprint.onl
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          yours forever
        </div>
      </div>
    </div>
  )
}
