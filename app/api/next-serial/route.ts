import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * GET /api/next-serial
 *
 * Returns the next serial number. Serial numbers aren't secret — they
 * appear on every public page — so this is intentionally unauthenticated.
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
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
