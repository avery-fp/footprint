import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'

/**
 * POST /api/upload/presign
 *
 * Returns a signed upload URL for Supabase Storage.
 *
 * Body: { path, slug }
 *   - path: the storage path (e.g. "7831/timestamp-hash.jpg"). The editor
 *           constructs paths keyed by serial_number, not slug, so we do
 *           NOT derive the slug from the path — we demand an explicit
 *           slug in the body.
 *   - slug: the footprint username. Auth is checked against this. For
 *           claimed footprints, the caller must hold the edit_token;
 *           for drafts (slug starts with "draft-"), knowledge of the
 *           slug is sufficient.
 *
 * Backward compat: if `slug` is missing, fall back to the first segment
 * of `path`. This lets any stragglers keep working while the client
 * catches up.
 */
export async function POST(request: NextRequest) {
  try {
    const { path, contentType, slug: bodySlug } = await request.json()

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const slug = (typeof bodySlug === 'string' && bodySlug.length > 0)
      ? bodySlug
      : path.split('/')[0]

    if (!slug) {
      return NextResponse.json({ error: 'slug required' }, { status: 400 })
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized', slug },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase.storage
      .from('content')
      .createSignedUploadUrl(path)

    if (error) {
      console.error('Presign error:', error)
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    })
  } catch (error) {
    console.error('Presign error:', error)
    return NextResponse.json({ error: 'Presign failed' }, { status: 500 })
  }
}
