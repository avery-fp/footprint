import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * GET /api/export
 *
 * Exports all of a user's Footprint data as JSON.
 *
 * This is important for:
 * - Data portability (users own their data)
 * - Backup purposes
 * - Migration to other platforms
 * - GDPR compliance
 *
 * The export includes:
 * - User profile (email, serial number, created date)
 * - All footprints/rooms with settings
 * - All content items (images + links) with metadata
 * - Analytics summary (not raw view data for privacy)
 *
 * Returns a JSON file that can be re-imported later.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // Fetch user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, serial_number, created_at')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch all footprints
    const { data: footprints } = await supabase
      .from('footprints')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    // Fetch all content (images + links) for user's serial numbers
    const serialNumbers = (footprints || [])
      .map(f => f.serial_number)
      .filter(Boolean)

    let allImages: any[] = []
    let allLinks: any[] = []
    let allRooms: any[] = []

    if (serialNumbers.length > 0) {
      const [imageRes, linkRes, roomRes] = await Promise.all([
        supabase
          .from('library')
          .select('*')
          .in('serial_number', serialNumbers)
          .order('position', { ascending: true }),
        supabase
          .from('links')
          .select('*')
          .in('serial_number', serialNumbers)
          .order('position', { ascending: true }),
        supabase
          .from('rooms')
          .select('*')
          .in('serial_number', serialNumbers)
          .order('position', { ascending: true }),
      ])
      allImages = imageRes.data || []
      allLinks = linkRes.data || []
      allRooms = roomRes.data || []
    }

    // Calculate analytics summary (not raw data for privacy)
    const analyticsSummary = {
      total_views: 0,
      footprint_views: {} as Record<string, number>,
    }

    if (footprints) {
      for (const fp of footprints) {
        analyticsSummary.total_views += fp.view_count || 0
        analyticsSummary.footprint_views[fp.username] = fp.view_count || 0
      }
    }

    // Build the export object
    const exportData = {
      // Export metadata
      _export: {
        version: '1.0',
        exported_at: new Date().toISOString(),
        format: 'footprint-export-v1',
      },

      // User data
      user: {
        email: user.email,
        serial_number: user.serial_number,
        created_at: user.created_at,
      },

      // All footprints with their content
      footprints: (footprints || []).map(fp => ({
        // Footprint metadata
        username: fp.username,
        name: fp.name,
        icon: fp.icon,
        is_primary: fp.is_primary,
        published: fp.published,

        // Profile
        display_name: fp.display_name,
        handle: fp.handle,
        bio: fp.bio,
        avatar_url: fp.avatar_url,

        // Customization
        dimension: fp.dimension,

        // Stats
        view_count: fp.view_count,
        created_at: fp.created_at,
        updated_at: fp.updated_at,

        // Rooms
        rooms: allRooms
          .filter(r => r.serial_number === fp.serial_number)
          .map(r => ({
            name: r.name,
            position: r.position,
          })),

        // Images
        images: allImages
          .filter(img => img.serial_number === fp.serial_number)
          .map(img => ({
            image_url: img.image_url,
            caption: img.caption,
            position: img.position,
            size: img.size,
            created_at: img.created_at,
          })),

        // Links
        links: allLinks
          .filter(link => link.serial_number === fp.serial_number)
          .map(link => ({
            url: link.url,
            platform: link.platform,
            title: link.title,
            position: link.position,
            size: link.size,
            created_at: link.created_at,
          })),
      })),

      // Analytics summary
      analytics: analyticsSummary,

      // Summary stats
      summary: {
        total_footprints: footprints?.length || 0,
        total_images: allImages.length,
        total_links: allLinks.length,
        total_views: analyticsSummary.total_views,
      },
    }

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0]
    const filename = `footprint-export-${user.serial_number}-${date}.json`

    // Return as downloadable JSON file
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })

  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
