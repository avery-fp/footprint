import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getVideoProvider } from '@/lib/video-providers'

/**
 * POST /api/webhooks/video
 *
 * Receives transcode-completion webhooks from the video provider (Mux).
 * Updates the library row with playback URL, poster, duration, and status='ready'.
 *
 * No user auth — verified via provider webhook signature.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const provider = getVideoProvider()

    const result = await provider.parseWebhook(body, request.headers)

    // Irrelevant event type or invalid signature — acknowledge silently
    if (!result) {
      return NextResponse.json({ received: true })
    }

    const supabase = createServerSupabaseClient()

    // Find and update the library row by asset_id
    // Idempotent: only update if not already ready
    const { data: tile, error } = await supabase
      .from('library')
      .update({
        playback_url: result.playbackUrl,
        poster_url: result.posterUrl,
        image_url: result.posterUrl, // Backward compat: legacy renders + OG tags use image_url
        duration_ms: result.durationMs,
        status: 'ready',
      })
      .eq('asset_id', result.assetId)
      .neq('status', 'ready')
      .select('id, serial_number')
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows matched (already ready or missing) — not an error
      console.error('Webhook update error:', error)
    }

    // Revalidate the public page if we found the tile
    if (tile?.serial_number) {
      const { data: footprint } = await supabase
        .from('footprints')
        .select('username')
        .eq('serial_number', tile.serial_number)
        .single()

      if (footprint?.username) {
        // Dynamic revalidation — next visit will see the ready video
        const { revalidatePath } = await import('next/cache')
        revalidatePath(`/${footprint.username}`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Video webhook error:', error)
    // Always return 200 to prevent provider retries on parse errors
    return NextResponse.json({ received: true })
  }
}
