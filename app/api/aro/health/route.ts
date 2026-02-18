import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { count } = await supabase.from('targets').select('id', { count: 'exact', head: true })
    return NextResponse.json({ status: 'ok', targets: count || 0, timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', targets: 0, timestamp: new Date().toISOString() }, { status: 500 })
  }
}
