import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * POST /api/upload/presign
 *
 * Returns a signed upload URL for Supabase Storage.
 * Uses service role key — bypasses storage RLS policies.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { path, contentType } = await request.json()

    if (!path) {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
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
