import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

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
 * - All content items with metadata
 * - Analytics summary (not raw view data for privacy)
 * 
 * Returns a JSON file that can be re-imported later.
 * Large exports could be converted to ZIP with separate files.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const userId = request.headers.get('x-user-id')
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

    // Fetch all content for all footprints
    const footprintIds = footprints?.map(f => f.id) || []
    
    let allContent: any[] = []
    if (footprintIds.length > 0) {
      const { data: content } = await supabase
        .from('content')
        .select('*')
        .in('footprint_id', footprintIds)
        .order('position', { ascending: true })
      
      allContent = content || []
    }

    // Calculate analytics summary (not raw data for privacy)
    let analyticsSummary = {
      total_views: 0,
      footprint_views: {} as Record<string, number>,
    }
    
    if (footprints) {
      for (const fp of footprints) {
        analyticsSummary.total_views += fp.view_count || 0
        analyticsSummary.footprint_views[fp.slug] = fp.view_count || 0
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
        slug: fp.slug,
        name: fp.name,
        icon: fp.icon,
        is_primary: fp.is_primary,
        is_public: fp.is_public,
        
        // Profile
        display_name: fp.display_name,
        handle: fp.handle,
        bio: fp.bio,
        avatar_url: fp.avatar_url,
        
        // Customization
        theme: fp.theme,
        
        // Stats
        view_count: fp.view_count,
        created_at: fp.created_at,
        updated_at: fp.updated_at,
        
        // Content items for this footprint
        content: allContent
          .filter(c => c.footprint_id === fp.id)
          .map(c => ({
            url: c.url,
            type: c.type,
            title: c.title,
            description: c.description,
            thumbnail_url: c.thumbnail_url,
            external_id: c.external_id,
            position: c.position,
            created_at: c.created_at,
          })),
      })),

      // Analytics summary
      analytics: analyticsSummary,

      // Summary stats
      summary: {
        total_footprints: footprints?.length || 0,
        total_content_items: allContent.length,
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
