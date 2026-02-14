import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/qr?slug=xxx
 * 
 * Generates a QR code for a Footprint.
 * 
 * Query parameters:
 * - slug: The footprint slug (required)
 * - size: Image size in pixels (default: 400, max: 1000)
 * - format: Output format - 'png' or 'svg' (default: png)
 * - dark: Dark color hex (default: 000000)
 * - light: Light color hex (default: FFFFFF)
 * 
 * The QR code links to the footprint's public URL.
 * Users can download these for business cards, posters, etc.
 * 
 * We verify the footprint exists and is public before generating.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    const size = Math.min(parseInt(searchParams.get('size') || '400'), 1000)
    const format = searchParams.get('format') || 'png'
    const darkColor = `#${searchParams.get('dark') || '000000'}`
    const lightColor = `#${searchParams.get('light') || 'FFFFFF'}`

    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 })
    }

    // Verify footprint exists and is public
    const supabase = createServerSupabaseClient()
    
    const { data: footprint, error } = await supabase
      .from('footprints')
      .select('slug, is_public')
      .eq('slug', slug)
      .eq('is_public', true)
      .single()

    if (error || !footprint) {
      return NextResponse.json({ error: 'Footprint not found' }, { status: 404 })
    }

    // Build the URL to encode
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'
    const footprintUrl = `${baseUrl}/${slug}`

    // Generate QR code based on format
    if (format === 'svg') {
      const svg = await QRCode.toString(footprintUrl, {
        type: 'svg',
        width: size,
        margin: 2,
        color: {
          dark: darkColor,
          light: lightColor,
        },
      })

      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        },
      })
    } else {
      // PNG format
      const pngBuffer = await QRCode.toBuffer(footprintUrl, {
        type: 'png',
        width: size,
        margin: 2,
        color: {
          dark: darkColor,
          light: lightColor,
        },
      })

      return new NextResponse(pngBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }

  } catch (error) {
    console.error('QR generation error:', error)
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 })
  }
}
