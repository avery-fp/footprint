import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'

/**
 * POST /api/upload/presign
 *
 * Returns a signed upload URL for Supabase Storage. Caller must present a
 * valid edit_token (or be on a draft slug) for the slug embedded in `path`.
 *
 * Path convention: "{slug}/..." — the first segment is the footprint slug.
 */
export async function POST(request: NextRequest) {
  try {
    const { path, contentType } = await request.json()

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const slug = path.split('/')[0]
    if (!slug) {
      return NextResponse.json({ error: 'path must begin with slug' }, { status: 400 })
    }

    const auth = await getEditAuth(request, slug)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
