import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('footprints')
      .select('serial_number')
      .order('serial_number', { ascending: false })
      .limit(1)
      .single()

    const next = data ? data.serial_number + 1 : 1002
    return NextResponse.json({ serial: next })
  } catch {
    return NextResponse.json({ serial: 1002 })
  }
}
