import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getEditAuth } from '@/lib/edit-auth'
import {
  footprintStatesDeleteSchema,
  footprintStatesPatchSchema,
  footprintStatesPostSchema,
  footprintStatesPutSchema,
} from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { normalizeFootprintStateSnapshot, type FootprintStateSnapshot } from '@/lib/footprint'

export const dynamic = 'force-dynamic'

async function getOwnedFootprint(
  request: NextRequest,
  slug: string
): Promise<
  | { error: NextResponse }
  | {
      supabase: ReturnType<typeof createServerSupabaseClient>
      footprint: { id: string; user_id: string | null; serial_number: number | null; username: string }
    }
> {
  const auth = await getEditAuth(request, slug)
  if (!auth.ok) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabase = createServerSupabaseClient()
  const { data: footprint } = await supabase
    .from('footprints')
    .select('id, user_id, serial_number, username')
    .eq('username', slug)
    .single()

  if (!footprint) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { supabase, footprint }
}

async function restoreFootprintSnapshot(params: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  footprint: { id: string; serial_number: number | null; username: string }
  snapshot: FootprintStateSnapshot
}) {
  const { supabase, footprint, snapshot } = params
  const serialNumber = footprint.serial_number

  const { error: footprintError } = await supabase
    .from('footprints')
    .update({
      display_title: snapshot.footprint.display_title,
      display_name: snapshot.footprint.display_name,
      handle: snapshot.footprint.handle,
      bio: snapshot.footprint.bio,
      dimension: snapshot.footprint.theme,
      grid_mode: snapshot.footprint.grid_mode,
      avatar_url: snapshot.footprint.avatar_url,
      background_url: snapshot.footprint.background_url,
      background_blur: snapshot.footprint.background_blur,
    })
    .eq('id', footprint.id)

  if (footprintError) {
    throw footprintError
  }

  if (!serialNumber) {
    if (snapshot.rooms.length > 0 || snapshot.content.length > 0) {
      throw new Error('This footprint cannot restore tiles or rooms until it has a serial number.')
    }
    return
  }

  const roomIdMap = new Map<string, string>()
  const roomRows = snapshot.rooms.map((room, index) => {
    const id = room.id || crypto.randomUUID()
    if (room.id) roomIdMap.set(room.id, id)
    return {
      id,
      serial_number: serialNumber,
      name: room.name,
      position: room.position ?? index,
      hidden: room.hidden ?? false,
      layout: room.layout === 'editorial' ? 'editorial' : 'grid',
    }
  })

  const libraryRows = snapshot.content
    .filter(tile => tile.source === 'library')
    .map((tile, index) => ({
      id: tile.id || crypto.randomUUID(),
      serial_number: serialNumber,
      image_url: tile.url,
      title: tile.title,
      caption: tile.caption ?? null,
      position: tile.position ?? index,
      size: tile.size ?? 1,
      aspect: tile.aspect ?? null,
      room_id: tile.room_id ? roomIdMap.get(tile.room_id) ?? null : null,
    }))

  const linkRows = snapshot.content
    .filter(tile => tile.source === 'links')
    .map((tile, index) => ({
      id: tile.id || crypto.randomUUID(),
      serial_number: serialNumber,
      url: tile.url,
      platform: tile.type,
      title: tile.title,
      thumbnail: tile.thumbnail_url,
      metadata: {
        description: tile.description,
        embed_html: tile.embed_html,
      },
      position: tile.position ?? index,
      size: tile.size ?? 1,
      aspect: tile.aspect ?? null,
      room_id: tile.room_id ? roomIdMap.get(tile.room_id) ?? null : null,
      render_mode: tile.render_mode || 'embed',
      artist: tile.artist ?? null,
      thumbnail_url_hq: tile.thumbnail_url_hq ?? null,
      media_id: tile.media_id ?? null,
    }))

  const { error: libraryDeleteError } = await supabase
    .from('library')
    .delete()
    .eq('serial_number', serialNumber)

  if (libraryDeleteError) throw libraryDeleteError

  const { error: linksDeleteError } = await supabase
    .from('links')
    .delete()
    .eq('serial_number', serialNumber)

  if (linksDeleteError) throw linksDeleteError

  const { error: roomsDeleteError } = await supabase
    .from('rooms')
    .delete()
    .eq('serial_number', serialNumber)

  if (roomsDeleteError) throw roomsDeleteError

  if (roomRows.length > 0) {
    const { error: roomsInsertError } = await supabase
      .from('rooms')
      .insert(roomRows)

    if (roomsInsertError) throw roomsInsertError
  }

  if (libraryRows.length > 0) {
    const { error: libraryInsertError } = await supabase
      .from('library')
      .insert(libraryRows)

    if (libraryInsertError) throw libraryInsertError
  }

  if (linkRows.length > 0) {
    const { error: linksInsertError } = await supabase
      .from('links')
      .insert(linkRows)

    if (linksInsertError) throw linksInsertError
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const owned = await getOwnedFootprint(request, params.slug)
  if ('error' in owned) return owned.error

  const { supabase, footprint } = owned
  const { data: states, error } = await supabase
    .from('footprint_states')
    .select('id, name, created_at, updated_at')
    .eq('footprint_id', footprint.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 })
  }

  return NextResponse.json({ states: states || [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const owned = await getOwnedFootprint(request, params.slug)
  if ('error' in owned) return owned.error

  const body = await request.json()
  const v = validateBody(footprintStatesPostSchema, body)
  if (!v.success) return v.response

  const { supabase, footprint } = owned
  const { name, snapshot } = v.data

  const { count, error: countError } = await supabase
    .from('footprint_states')
    .select('id', { count: 'exact', head: true })
    .eq('footprint_id', footprint.id)

  if (countError) {
    return NextResponse.json({ error: 'Failed to count states' }, { status: 500 })
  }

  if ((count || 0) >= 5) {
    return NextResponse.json({ error: 'State limit reached' }, { status: 409 })
  }

  const normalizedSnapshot = normalizeFootprintStateSnapshot(snapshot)
  const { data: state, error } = await supabase
    .from('footprint_states')
    .insert({
      footprint_id: footprint.id,
      name,
      snapshot: normalizedSnapshot,
    })
    .select('id, name, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to save state' }, { status: 500 })
  }

  return NextResponse.json({ state })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const owned = await getOwnedFootprint(request, params.slug)
  if ('error' in owned) return owned.error

  const body = await request.json()
  const v = validateBody(footprintStatesPutSchema, body)
  if (!v.success) return v.response

  const { supabase, footprint } = owned

  if (v.data.action === 'replace') {
    const normalizedSnapshot = normalizeFootprintStateSnapshot(v.data.snapshot)
    const { data: state, error } = await supabase
      .from('footprint_states')
      .update({
        name: v.data.name,
        snapshot: normalizedSnapshot,
      })
      .eq('id', v.data.state_id)
      .eq('footprint_id', footprint.id)
      .select('id, name, created_at, updated_at')
      .single()

    if (error || !state) {
      return NextResponse.json({ error: 'Failed to replace state' }, { status: 500 })
    }

    return NextResponse.json({ state })
  }

  const { data: state, error } = await supabase
    .from('footprint_states')
    .select('id, snapshot')
    .eq('id', v.data.state_id)
    .eq('footprint_id', footprint.id)
    .single()

  if (error || !state) {
    return NextResponse.json({ error: 'State not found' }, { status: 404 })
  }

  const snapshot = normalizeFootprintStateSnapshot(state.snapshot)

  try {
    await restoreFootprintSnapshot({
      supabase,
      footprint,
      snapshot,
    })
  } catch (restoreError) {
    const message =
      restoreError instanceof Error ? restoreError.message : 'Failed to load state'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  revalidatePath(`/${params.slug}`)
  return NextResponse.json({ success: true, snapshot })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const owned = await getOwnedFootprint(request, params.slug)
  if ('error' in owned) return owned.error

  const body = await request.json()
  const v = validateBody(footprintStatesPatchSchema, body)
  if (!v.success) return v.response

  const { supabase, footprint } = owned
  const { data: state, error } = await supabase
    .from('footprint_states')
    .update({ name: v.data.name })
    .eq('id', v.data.state_id)
    .eq('footprint_id', footprint.id)
    .select('id, name, created_at, updated_at')
    .single()

  if (error || !state) {
    return NextResponse.json({ error: 'Failed to rename state' }, { status: 500 })
  }

  return NextResponse.json({ state })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const owned = await getOwnedFootprint(request, params.slug)
  if ('error' in owned) return owned.error

  const body = await request.json()
  const v = validateBody(footprintStatesDeleteSchema, body)
  if (!v.success) return v.response

  const { supabase, footprint } = owned
  const { error } = await supabase
    .from('footprint_states')
    .delete()
    .eq('id', v.data.state_id)
    .eq('footprint_id', footprint.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete state' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
