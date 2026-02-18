import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/share?slug=xxx
 *
 * Returns share data for a footprint:
 * - share_url (with referral code)
 * - card_url (PNG share card)
 * - referral_code
 * - referral_count
 *
 * Public endpoint — anyone can get share data for any published footprint.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://footprint.onl'

  // Find footprint
  let footprint = null
  const { data: bySlug } = await supabase
    .from('footprints')
    .select('id, slug, user_id, display_name')
    .eq('slug', slug)
    .single()

  if (bySlug) {
    footprint = bySlug
  } else {
    const { data: byUsername } = await supabase
      .from('footprints')
      .select('id, slug, user_id, display_name, serial_number')
      .eq('username', slug)
      .single()
    footprint = byUsername
  }

  if (!footprint) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Get serial number for referral code
  const { data: user } = await supabase
    .from('users')
    .select('serial_number')
    .eq('id', footprint.user_id)
    .single()

  const serial = user?.serial_number || (footprint as any).serial_number || 0
  const referralCode = `FP-${serial}`

  // Count referrals
  const { count: referralCount } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_serial', serial)
    .eq('converted', true)

  const shareUrl = `${baseUrl}/${slug}?ref=${referralCode}`
  const cardUrl = `${baseUrl}/api/share/card?slug=${slug}`

  return NextResponse.json({
    share_url: shareUrl,
    card_url: cardUrl,
    referral_code: referralCode,
    referral_count: referralCount || 0,
    display_name: footprint.display_name,
    slug: footprint.slug || slug,
  })
}
