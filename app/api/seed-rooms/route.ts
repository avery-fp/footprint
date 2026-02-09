import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * POST /api/seed-rooms
 *
 * One-shot: Create 5 rooms for serial_number 1001 (slug: ae)
 * and distribute existing content randomly across them.
 *
 * Body: { serial_number: 1001 } (or omit for default 1001)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const serialNumber = body.serial_number || 1001

    const supabase = createServerSupabaseClient()

    // 1. Check existing rooms
    const { data: existingRooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', serialNumber)
      .order('position')

    if (existingRooms && existingRooms.length > 0) {
      return NextResponse.json({
        message: `Already has ${existingRooms.length} rooms`,
        rooms: existingRooms,
      })
    }

    // 2. Create 5 rooms
    const roomNames = ['void', 'world', 'fits', 'sound', 'archive']
    const { data: rooms, error: roomError } = await supabase
      .from('rooms')
      .insert(roomNames.map((name, i) => ({
        serial_number: serialNumber,
        name,
        position: i,
      })))
      .select()

    if (roomError) {
      return NextResponse.json({ error: roomError.message }, { status: 500 })
    }

    // 3. Get all existing content
    const [{ data: images }, { data: links }] = await Promise.all([
      supabase.from('library').select('id').eq('serial_number', serialNumber),
      supabase.from('links').select('id').eq('serial_number', serialNumber),
    ])

    const allItems = [
      ...(images || []).map(img => ({ id: img.id, table: 'library' as const })),
      ...(links || []).map(link => ({ id: link.id, table: 'links' as const })),
    ]

    if (allItems.length === 0) {
      return NextResponse.json({
        message: 'Rooms created but no content to distribute',
        rooms,
      })
    }

    // 4. Distribute randomly across rooms
    const roomIds = rooms!.map(r => r.id)
    const shuffled = allItems.sort(() => Math.random() - 0.5)

    // Batch updates by table
    const libraryUpdates: { id: string; room_id: string }[] = []
    const linksUpdates: { id: string; room_id: string }[] = []

    shuffled.forEach((item, i) => {
      const roomId = roomIds[i % roomIds.length]
      if (item.table === 'library') {
        libraryUpdates.push({ id: item.id, room_id: roomId })
      } else {
        linksUpdates.push({ id: item.id, room_id: roomId })
      }
    })

    // Update each tile's room_id
    const updatePromises: Promise<any>[] = []
    for (const u of libraryUpdates) {
      updatePromises.push(
        supabase.from('library').update({ room_id: u.room_id }).eq('id', u.id)
      )
    }
    for (const u of linksUpdates) {
      updatePromises.push(
        supabase.from('links').update({ room_id: u.room_id }).eq('id', u.id)
      )
    }
    await Promise.all(updatePromises)

    // 5. Summary
    const distribution: Record<string, number> = {}
    rooms!.forEach(r => { distribution[r.name] = 0 })
    shuffled.forEach((_, i) => {
      const roomName = rooms![i % rooms!.length].name
      distribution[roomName]++
    })

    return NextResponse.json({
      message: `Created ${rooms!.length} rooms, distributed ${allItems.length} tiles`,
      rooms,
      distribution,
    })
  } catch (error) {
    console.error('Seed rooms error:', error)
    return NextResponse.json({ error: 'Failed to seed rooms' }, { status: 500 })
  }
}
