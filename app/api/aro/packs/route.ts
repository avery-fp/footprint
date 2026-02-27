import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/aro/packs?aro_key=xxx
 *
 * List all deployment packs.
 * Optional: ?status=pending to filter by status.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const aroKey = searchParams.get('aro_key')

    if (!aroKey || aroKey !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    const status = searchParams.get('status')
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('fp_deployment_packs')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: packs, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    return NextResponse.json({ packs: packs || [] })
  } catch (error: any) {
    console.error('Packs GET error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch packs' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/aro/packs
 *
 * Create a new deployment pack.
 * Body: { aro_key, pack_id, name, slug, room_name?, cluster?, captions?, targets?, score? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      aro_key,
      pack_id,
      name,
      slug,
      room_name,
      cluster,
      captions,
      targets,
      score,
    } = body

    if (!aro_key || aro_key !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    if (!pack_id || !name || !slug) {
      return NextResponse.json(
        { error: 'pack_id, name, and slug required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: pack, error } = await supabase
      .from('fp_deployment_packs')
      .insert({
        pack_id,
        name,
        slug,
        room_name: room_name || null,
        cluster: cluster || null,
        captions: captions || [],
        targets: targets || [],
        score: score || 0,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    return NextResponse.json({ pack })
  } catch (error: any) {
    console.error('Packs POST error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to create pack' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/aro/packs
 *
 * Update a pack (e.g., mark targets as posted, update status).
 * Body: { aro_key, pack_id, targets?, status?, score? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { aro_key, pack_id, targets, status, score } = body

    if (!aro_key || aro_key !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    if (!pack_id) {
      return NextResponse.json(
        { error: 'pack_id required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    const updates: Record<string, any> = {}
    if (targets !== undefined) updates.targets = targets
    if (status !== undefined) updates.status = status
    if (score !== undefined) updates.score = score

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data: pack, error } = await supabase
      .from('fp_deployment_packs')
      .update(updates)
      .eq('pack_id', pack_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    return NextResponse.json({ pack })
  } catch (error: any) {
    console.error('Packs PATCH error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update pack' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/aro/packs?aro_key=xxx&pack_id=yyy
 *
 * Delete a deployment pack.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const aroKey = searchParams.get('aro_key')
    const packId = searchParams.get('pack_id')

    if (!aroKey || aroKey !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    if (!packId) {
      return NextResponse.json(
        { error: 'pack_id required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('fp_deployment_packs')
      .delete()
      .eq('pack_id', packId)

    if (error) {
      return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Packs DELETE error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to delete pack' },
      { status: 500 }
    )
  }
}
