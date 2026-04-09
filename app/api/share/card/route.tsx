import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getFootprintDisplayTitle } from '@/lib/footprint'

export const runtime = 'edge'

/**
 * GET /api/share/card?slug=xxx
 *
 * Generates a 1080x1080 share card PNG for social posting.
 * Shows: serial number, display name, tile preview, referral link.
 * Designed for Instagram stories, Twitter posts, TikTok overlays.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#080808',
            color: '#F5F5F5',
            fontFamily: 'system-ui',
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: '-0.04em' }}>footprint</div>
        </div>
      ),
      { width: 1080, height: 1080 }
    )
  }

  const supabase = createServerSupabaseClient()

  // Fetch footprint data
  const { data: footprint } = await supabase
    .from('footprints')
    .select('*, users (serial_number)')
    .eq('slug', slug)
    .single()

  // Also try username match
  const fp = footprint || (await supabase
    .from('footprints')
    .select('*, users (serial_number)')
    .eq('username', slug)
    .single()).data

  const serial = fp?.users?.serial_number || fp?.serial_number || 0
  const name = getFootprintDisplayTitle(fp) || slug
  const bioText = fp?.bio || 'one page for everything.'
  const wallpaper = fp?.background_url || ''
  const refCode = `FP-${serial}`

  // Fetch tile previews
  const { data: images } = await supabase
    .from('library')
    .select('image_url')
    .eq('serial_number', serial)
    .order('position')
    .limit(4)

  const tileUrls = (images || []).map((img: any) => img.image_url).filter(Boolean).slice(0, 4)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#080808',
          color: '#F5F5F5',
          fontFamily: 'system-ui',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Wallpaper background */}
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
              filter: 'blur(30px) brightness(0.2) saturate(0.6)',
            }}
          />
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(180deg, rgba(8,8,8,0.3) 0%, rgba(8,8,8,0.85) 100%)',
          }}
        />

        {/* Content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '64px',
            justifyContent: 'space-between',
          }}
        >
          {/* Top: brand + serial */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              style={{
                fontSize: 16,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                opacity: 0.35,
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '8px 20px',
                borderRadius: 999,
              }}
            >
              footprint
            </div>
            <div style={{ fontSize: 18, opacity: 0.25, fontFamily: 'monospace' }}>
              #{String(serial).padStart(4, '0')}
            </div>
          </div>

          {/* Middle: tiles grid */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            {tileUrls.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  justifyContent: 'center',
                  maxWidth: 700,
                }}
              >
                {tileUrls.map((url: string, i: number) => (
                  <img
                    key={i}
                    src={url}
                    style={{
                      width: tileUrls.length <= 2 ? 300 : 220,
                      height: tileUrls.length <= 2 ? 300 : 220,
                      objectFit: 'cover',
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 120, opacity: 0.08 }}>◈</div>
            )}
          </div>

          {/* Bottom: name + referral link */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em' }}>
              {name}
            </div>
            <div style={{ fontSize: 16, opacity: 0.35, lineHeight: 1.5 }}>
              {bioText.length > 80 ? bioText.slice(0, 80) + '...' : bioText}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 16,
                paddingTop: 20,
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 15, opacity: 0.4, fontFamily: 'monospace' }}>
                footprint.onl/{slug}
              </div>
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.3,
                  background: 'rgba(255,255,255,0.06)',
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                }}
              >
                ref: {refCode}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  )
}
