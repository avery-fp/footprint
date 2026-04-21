import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

/**
 * GET /api/revalidate?path=/some/path
 *
 * Administrative cache-bust. Gated by REVALIDATE_SECRET in the
 * X-Revalidate-Secret header to prevent cache-busting attacks.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET
  const header = request.headers.get('x-revalidate-secret')
  if (!secret || header !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const path = new URL(request.url).searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }
  revalidatePath(path)
  return NextResponse.json({ revalidated: true })
}
