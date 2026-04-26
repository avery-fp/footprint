import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getStripe } from '@/lib/stripe'
import { getEditAuth } from '@/lib/edit-auth'
import { loadFootprint } from '@/lib/loadFootprint'

export const dynamic = 'force-dynamic'

/**
 * GET /api/footprint/[slug]
 *
 * Two personas:
 *
 * 1. Editor / API client holding an edit_token (cookie, ?token=, or header)
 *    → returns { owned: true, footprint, tiles }
 *
 * 2. Post-payment claim poll: ?stripe_session_id=... — if the session is
 *    completed within the last 10 minutes AND its metadata matches this
 *    slug, return the edit_token so the client can unlock editing. This
 *    is the short-window UX gap between Stripe success_url redirect and
 *    webhook completion.
 *
 * No token and no valid stripe_session_id → 401.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug
    const url = new URL(request.url)
    const stripeSessionId = url.searchParams.get('stripe_session_id')

    // ── Post-payment token return ──
    if (stripeSessionId) {
      const token = await tokenForPaidSession(slug, stripeSessionId)
      if (token) {
        const result = await loadFootprint(slug, { ownerView: true })
        if (!result) {
          return NextResponse.json({ owned: false, edit_token: null }, { status: 404 })
        }
        return NextResponse.json({
          owned: true,
          edit_token: token,
          footprint: result.footprint,
          tiles: result.content,
        })
      }
      // Webhook not done yet; surface a soft 200 so the client keeps polling.
      return NextResponse.json({ owned: false, edit_token: null })
    }

    // ── Standard edit-token path ──
    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ owned: false }, { status: 401 })
    }

    const result = await loadFootprint(slug, { ownerView: true })
    if (!result) {
      return NextResponse.json({ owned: false })
    }

    return NextResponse.json({
      owned: true,
      footprint: result.footprint,
      tiles: result.content,
    })
  } catch (error) {
    console.error('Footprint lookup error:', error)
    return NextResponse.json({ owned: false })
  }
}

/**
 * If the Stripe session paid for this slug, is "paid", and completed within
 * the last 10 minutes, return the edit_token. Otherwise null.
 */
async function tokenForPaidSession(slug: string, sessionId: string): Promise<string | null> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') return null

    const metaSlug = (session.metadata as any)?.desired_slug || (session.metadata as any)?.slug
    if (metaSlug !== slug) return null

    const createdMs = (session.created || 0) * 1000
    if (Date.now() - createdMs > 10 * 60 * 1000) return null

    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('footprints')
      .select('edit_token')
      .eq('username', slug)
      .maybeSingle()
    return data?.edit_token || null
  } catch {
    return null
  }
}

/**
 * PUT /api/footprint/[slug]
 *
 * Updates footprint settings. Requires edit_token for this slug.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const auth = await getEditAuth(request, params.slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const username = params.slug
    const supabase = createServerSupabaseClient()

    const body = await request.json()
    const { is_public, published, display_title, display_name, handle, bio, theme, grid_mode, background_url, background_blur, interactive } = body

    const updates: any = {}
    if (typeof is_public === 'boolean') updates.published = is_public
    if (typeof published === 'boolean') updates.published = published
    if (typeof display_title === 'string') updates.display_title = display_title.trim() || null
    if (typeof display_name === 'string') updates.display_name = display_name
    if (typeof handle === 'string') updates.handle = handle
    if (typeof bio === 'string') updates.bio = bio
    if (typeof theme === 'string') updates.dimension = theme
    if (typeof grid_mode === 'string') updates.grid_mode = grid_mode
    if (typeof background_url === 'string') updates.background_url = background_url
    if (typeof background_blur === 'boolean') updates.background_blur = background_blur
    if (typeof interactive === 'boolean') updates.interactive = interactive

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('footprints')
      .update(updates)
      .eq('username', username)
      .select('username')

    if (updateError) {
      console.error('[footprint PUT] update failed', {
        slug: username,
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        updates,
      })
      return NextResponse.json(
        {
          error: 'Update failed',
          code: updateError.code || null,
          detail: updateError.message || null,
          hint: updateError.hint || null,
        },
        { status: 500 }
      )
    }

    // Zero rows updated = row not found for this username. Postgres +
    // Supabase don't raise an error for this — without an explicit
    // check we'd return success=true while writing nothing, which is
    // exactly what the wallpaper PUT symptom looks like.
    if (!updated || updated.length === 0) {
      console.error('[footprint PUT] update affected 0 rows', {
        slug: username,
        updates,
        auth_is_draft: auth.isDraft,
      })
      return NextResponse.json(
        { error: 'Footprint not found', slug: username },
        { status: 404 }
      )
    }

    try {
      revalidatePath(`/${username}`)
    } catch (revalError) {
      // Revalidation is best-effort; do not fail the write if the cache
      // invalidation hits a Next internal (e.g. during static export).
      console.warn('[footprint PUT] revalidatePath failed (non-fatal)', { slug: username, err: revalError })
    }
    return NextResponse.json({ success: true, ...updates })
  } catch (error: any) {
    console.error('[footprint PUT] threw', { message: error?.message, stack: error?.stack })
    return NextResponse.json(
      { error: 'Failed to update', detail: error?.message || null },
      { status: 500 }
    )
  }
}
