import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { nanoid } from 'nanoid'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const supabase = createServerSupabaseClient()

    // Check if user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id, serial_number')
      .eq('email', email)
      .single()

    if (existing) {
      return NextResponse.json({ 
        serial: existing.serial_number,
        exists: true 
      })
    }

    // Claim next serial
    const { data: serialData, error: serialError } = await supabase.rpc('claim_next_serial')
    if (serialError || !serialData) {
      // Fallback: manual serial claim
      const { data: latest } = await supabase
        .from('users')
        .select('serial_number')
        .order('serial_number', { ascending: false })
        .limit(1)
        .single()
      
      const nextSerial = latest ? latest.serial_number + 1 : 1002
      
      // Create user
      const { data: user, error: userError } = await supabase
        .from('users')
        .insert({ email, serial_number: nextSerial })
        .select()
        .single()
      
      if (userError) throw userError

      // Create default footprint
      const slug = `fp-${nextSerial}-${nanoid(4).toLowerCase()}`
      await supabase.from('footprints').insert({
        user_id: user.id,
        slug,
        name: 'Everything',
        icon: '◈',
        is_primary: true,
        is_public: true,
      })

      return NextResponse.json({ serial: nextSerial, exists: false })
    }

    const serial = serialData

    // Create user with claimed serial
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({ email, serial_number: serial })
      .select()
      .single()
    
    if (userError) throw userError

    // Create default footprint
    const slug = `fp-${serial}-${nanoid(4).toLowerCase()}`
    await supabase.from('footprints').insert({
      user_id: user.id,
      slug,
      name: 'Everything',
      icon: '◈',
      is_primary: true,
      is_public: true,
    })

    return NextResponse.json({ serial, exists: false })
  } catch (error: any) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 })
  }
}
