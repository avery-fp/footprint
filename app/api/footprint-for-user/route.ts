import { NextRequest, NextResponse } from 'next/server'
import { getUserIdFromRequest } from '@/lib/auth'
import { ensurePrimaryFootprintForUser } from '@/lib/primary-footprint'

/**
 * GET /api/footprint-for-user
 *
 * Returns the current authenticated user's primary footprint slug.
 * Creates a blank primary footprint when identity exists but authorship does not yet.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const footprint = await ensurePrimaryFootprintForUser(userId)
    if (!footprint) {
      return NextResponse.json({ error: 'No footprint' }, { status: 404 })
    }

    return NextResponse.json({
      slug: footprint.slug,
      published: footprint.published,
    })
  } catch (error) {
    console.error('Footprint-for-user error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
