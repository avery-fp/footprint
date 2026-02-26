import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const aroKey = new URL(request.url).searchParams.get('aro_key')
  if (!aroKey || aroKey !== process.env.ARO_KEY) {
    return NextResponse.json({ error: 'Invalid aro_key' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('targets')
    .select('*, categories(name)')
    .order('layer', { ascending: true })
    .order('conversion_probability', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch targets' }, { status: 500 })
  }

  // Group by layer
  const byLayer: Record<number, number> = {}
  for (const t of data || []) {
    byLayer[t.layer] = (byLayer[t.layer] || 0) + 1
  }

  return NextResponse.json({
    total: data?.length || 0,
    byLayer,
    targets: data || [],
  })
}
