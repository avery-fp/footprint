import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import QRCode from 'qrcode'

/**
 * GET /api/share/qr?slug=xxx&ref=FP-7777
 *
 * Generates a QR code with the referral code baked into the URL.
 * White-on-transparent for overlay on dark share cards.
 *
 * Query params:
 *   slug - footprint slug (required)
 *   ref - referral code (optional, auto-detected from slug owner)
 *   size - pixel size (default 600, max 1200)
 *   style - 'dark' (white QR on transparent) or 'light' (black on white)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    const refParam = searchParams.get('ref')
    const size = Math.min(parseInt(searchParams.get('size') || '600'), 1200)
    const style = searchParams.get('style') || 'dark'

    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

    // Auto-detect ref from slug owner if not provided
    let ref = refParam
    if (!ref) {
      const supabase = createServerSupabaseClient()
      const { data: fp } = await supabase
        .from('footprints')
        .select('user_id')
        .or(`slug.eq.${slug},username.eq.${slug}`)
        .single()

      if (fp) {
        const { data: user } = await supabase
          .from('users')
          .select('serial_number')
          .eq('id', fp.user_id)
          .single()

        if (user) ref = `FP-${user.serial_number}`
      }
    }

    const url = ref
      ? `${baseUrl}/${slug}?ref=${ref}`
      : `${baseUrl}/${slug}`

    const darkColor = style === 'dark' ? '#FFFFFF' : '#000000'
    const lightColor = style === 'dark' ? '#00000000' : '#FFFFFF'

    const pngBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: size,
      margin: 2,
      color: { dark: darkColor, light: lightColor },
      errorCorrectionLevel: 'M',
    })

    return new NextResponse(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Content-Disposition': `inline; filename="footprint-${slug}-qr.png"`,
      },
    })
  } catch (error) {
    console.error('Share QR error:', error)
    return NextResponse.json({ error: 'QR generation failed' }, { status: 500 })
  }
}
