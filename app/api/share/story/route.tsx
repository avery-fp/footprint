import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getFootprintDisplayTitle } from '@/lib/footprint'

export const runtime = 'edge'

/**
 * GET /api/share/story?slug=xxx
 *
 * Generates a 1080x1920 story-format share card for Instagram/TikTok stories.
 * Vertical layout optimized for story dimensions.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', backgroundColor: '#080808', color: '#F5F5F5',
          fontFamily: 'system-ui', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 72, fontWeight: 300, letterSpacing: '-0.04em' }}>footprint</div>
          <div style={{ fontSize: 18, opacity: 0.3, marginTop: 16 }}>one page for everything.</div>
        </div>
      ),
      { width: 1080, height: 1920 }
    )
  }

  const supabase = createServerSupabaseClient()

  const { data: footprint } = await supabase
    .from('footprints')
    .select('*, users (serial_number)')
    .eq('slug', slug)
    .single()

  const fp = footprint || (await supabase
    .from('footprints')
    .select('*, users (serial_number)')
    .eq('username', slug)
    .single()).data

  const serial = fp?.users?.serial_number || fp?.serial_number || 0
  const name = getFootprintDisplayTitle(fp) || slug
  const bioText = fp?.bio || ''
  const wallpaper = fp?.background_url || ''
  const refCode = `FP-${serial}`

  const { data: images } = await supabase
    .from('library')
    .select('image_url')
    .eq('serial_number', serial)
    .order('position')
    .limit(6)

  const tiles = (images || []).map((img: any) => img.image_url).filter(Boolean).slice(0, 6)

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        backgroundColor: '#080808', color: '#F5F5F5', fontFamily: 'system-ui',
        position: 'relative', overflow: 'hidden',
      }}>
        {wallpaper && (
          <img src={wallpaper} style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            objectFit: 'cover', filter: 'blur(40px) brightness(0.15) saturate(0.5)',
          }} />
        )}

        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          background: 'linear-gradient(180deg, rgba(8,8,8,0.2) 0%, rgba(8,8,8,0.6) 50%, rgba(8,8,8,0.95) 100%)',
        }} />

        <div style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          height: '100%', padding: '80px 64px', justifyContent: 'space-between',
        }}>
          {/* Top: brand */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase',
              opacity: 0.3, border: '1px solid rgba(255,255,255,0.12)',
              padding: '10px 24px', borderRadius: 999,
            }}>
              footprint
            </div>
          </div>

          {/* Middle: tiles in 2x3 grid */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {tiles.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 640 }}>
                {tiles.map((url: string, i: number) => (
                  <img key={i} src={url} style={{
                    width: tiles.length <= 2 ? 280 : 190,
                    height: tiles.length <= 2 ? 280 : 190,
                    objectFit: 'cover', borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }} />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 160, opacity: 0.06 }}>◈</div>
            )}
          </div>

          {/* Bottom: identity + CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 44, fontWeight: 400, letterSpacing: '-0.02em', textAlign: 'center' }}>
              {name}
            </div>
            {bioText && (
              <div style={{ fontSize: 16, opacity: 0.35, textAlign: 'center', maxWidth: 500 }}>
                {bioText.length > 100 ? bioText.slice(0, 100) + '...' : bioText}
              </div>
            )}
            <div style={{ fontSize: 20, opacity: 0.2, fontFamily: 'monospace', marginTop: 8 }}>
              #{String(serial).padStart(4, '0')}
            </div>

            {/* CTA pill */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 999, padding: '14px 32px', marginTop: 20,
            }}>
              <span style={{ fontSize: 15, opacity: 0.6 }}>footprint.onl/{slug}</span>
            </div>

            <div style={{
              fontSize: 12, opacity: 0.2, fontFamily: 'monospace', marginTop: 8,
            }}>
              ref: {refCode}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  )
}
