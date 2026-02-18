import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('targets')
    .select('*, categories(name)')
    .order('layer', { ascending: true })
    .order('conversion_probability', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
