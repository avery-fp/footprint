import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/og?slug=xxx
 * 
 * Generates dynamic Open Graph images for social sharing.
 * 
 * When someone shares a Footprint link on Twitter, Discord, etc.,
 * this generates a beautiful preview card on the fly.
 * 
 * The image includes:
 * - User's avatar (or placeholder)
 * - Display name
 * - Handle
 * - Serial number
 * - Content count
 * - Beautiful dark theme matching the site
 * 
 * Using @vercel/og which uses Satori under the hood for
 * server-side image generation with React-like syntax.
 */

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
            <div style={{ fontSize: 96, fontWeight: 500, letterSpacing: '-0.04em', marginBottom: 16 }}>footprint</div>
            <div style={{ fontSize: 24, opacity: 0.4, fontWeight: 300, marginBottom: 48 }}>
              your permanent space on the internet
            </div>
            <div style={{ fontSize: 20, opacity: 0.3, fontWeight: 400 }}>
              one page. infinite rooms. $10 forever.
            </div>
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

    // Fetch footprint data
    const supabase = createServerSupabaseClient()
    
    const { data: footprint } = await supabase
      .from('footprints')
      .select(`
        *,
        users (serial_number),
        content (count)
      `)
      .eq('slug', slug)
      .single()

    if (!footprint) {
      return new ImageResponse(
        (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#07080A',
              color: '#F5F5F5',
            }}
          >
            <div style={{ fontSize: 48 }}>Footprint not found</div>
          </div>
        ),
        { width: 1200, height: 630 }
      )
    }

    const serialNumber = footprint.users?.serial_number || 0
    const contentCount = footprint.content?.[0]?.count || 0
    const displayName = footprint.display_name || 'Untitled'
    const handle = footprint.handle || ''
    const avatarUrl = footprint.avatar_url

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
            padding: 60,
          }}
        >
          {/* Top bar with logo and serial */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 60,
            }}
          >
            <div style={{ fontSize: 24, letterSpacing: '0.1em', opacity: 0.5 }}>
              FOOTPRINT
            </div>
            <div style={{ fontSize: 20, opacity: 0.4 }}>
              #{serialNumber.toLocaleString()}
            </div>
          </div>

          {/* Main content */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              alignItems: 'center',
              gap: 48,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: '50%',
                background: avatarUrl 
                  ? `url(${avatarUrl})` 
                  : 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '3px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 64,
              }}
            >
              {!avatarUrl && '◈'}
            </div>

            {/* Info */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 56, fontWeight: 400, marginBottom: 8 }}>
                {displayName}
              </div>
              {handle && (
                <div style={{ fontSize: 28, opacity: 0.5, marginBottom: 24 }}>
                  {handle}
                </div>
              )}
              <div style={{ fontSize: 20, opacity: 0.4 }}>
                {contentCount} items curated
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 40,
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ fontSize: 18, opacity: 0.3 }}>
              footprint.link/{slug}
            </div>
            <div style={{ fontSize: 16, opacity: 0.3 }}>
              $10 · Yours forever
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )

  } catch (error) {
    console.error('OG image error:', error)
    
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#07080A',
            color: '#F5F5F5',
          }}
        >
          <div style={{ fontSize: 48 }}>Footprint</div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }
}
