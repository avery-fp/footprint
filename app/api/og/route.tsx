import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return new ImageResponse(
        (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              backgroundColor: '#0a0a0a',
              color: '#F5F5F5',
              fontFamily: 'system-ui',
              padding: 80,
            }}
          >
            <div style={{ fontSize: 96, fontWeight: 400, letterSpacing: '-0.04em', marginBottom: 16 }}>footprint</div>
            <div style={{ fontSize: 24, opacity: 0.35, fontWeight: 300 }}>
              a room for your internet. $10.
            </div>
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Fetch footprint + wallpaper
    const { data: footprint } = await supabase
      .from('footprints')
      .select('*, users (serial_number)')
      .eq('slug', slug)
      .single()

    if (!footprint) {
      return new ImageResponse(
        (
          <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#07080A', color: '#F5F5F5' }}>
            <div style={{ fontSize: 48 }}>footprint</div>
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

    const serial = footprint.users?.serial_number || footprint.serial_number || 0
    const wallpaper = footprint.background_url || ''

    // Fetch first 6 tile images
    const { data: images } = await supabase
      .from('library')
      .select('image_url')
      .eq('serial_number', serial)
      .order('position')
      .limit(6)

    const { data: links } = await supabase
      .from('links')
      .select('thumbnail')
      .eq('serial_number', serial)
      .not('thumbnail', 'is', null)
      .order('position')
      .limit(6)

    // Combine tile images, prefer library images
    const tileUrls: string[] = []
    if (images) {
      for (const img of images) {
        if (img.image_url && tileUrls.length < 6) tileUrls.push(img.image_url)
      }
    }
    if (links) {
      for (const link of links) {
        if (link.thumbnail && tileUrls.length < 6) tileUrls.push(link.thumbnail)
      }
    }

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#07080A',
            color: '#F5F5F5',
            fontFamily: 'system-ui',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Wallpaper - blurred background */}
          {wallpaper && (
            <img
              src={wallpaper}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(20px) brightness(0.3) saturate(0.8)',
              }}
            />
          )}

          {/* Dark overlay */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%)',
            }}
          />

          {/* Content */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              padding: '48px 56px',
            }}
          >
            {/* Header: footprint badge + serial */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 40,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  opacity: 0.4,
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '6px 16px',
                  borderRadius: 999,
                }}
              >
                footprint
              </div>
              <div style={{ fontSize: 16, opacity: 0.3, fontFamily: 'monospace' }}>
                #{String(serial).padStart(4, '0')}
              </div>
            </div>

            {/* Tile grid - the actual room preview */}
            <div
              style={{
                display: 'flex',
                flex: 1,
                gap: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {tileUrls.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    maxWidth: 1000,
                  }}
                >
                  {tileUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      style={{
                        width: i === 0 ? 320 : 200,
                        height: i === 0 ? 320 : 200,
                        objectFit: 'cover',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 32, opacity: 0.2 }}>◈</div>
              )}
            </div>

            {/* Footer: name + slug */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em' }}>
                  {footprint.display_name || footprint.name || slug}
                </div>
                <div style={{ fontSize: 15, opacity: 0.3 }}>
                  footprint.onl/{slug}
                </div>
              </div>
              <div style={{ fontSize: 14, opacity: 0.25 }}>
                $10 · yours
              </div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )

  } catch (error) {
    console.error('OG image error:', error)
    return new ImageResponse(
      (
        <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#07080A', color: '#F5F5F5' }}>
          <div style={{ fontSize: 48, fontWeight: 400, letterSpacing: '-0.03em' }}>footprint</div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }
}
