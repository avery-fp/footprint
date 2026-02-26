import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const aroKey = new URL(request.url).searchParams.get('aro_key')
    if (!aroKey || aroKey !== process.env.ARO_KEY) {
      return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()
    const { count } = await supabase.from('targets').select('id', { count: 'exact', head: true })
    return NextResponse.json({ status: 'ok', targets: count || 0, timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', targets: 0, timestamp: new Date().toISOString() }, { status: 500 })
  }
}
