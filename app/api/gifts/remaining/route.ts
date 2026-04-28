import { NextRequest, NextResponse } from 'next/server'
import { getEditAuth } from '@/lib/edit-auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug')
  if (!slug) return NextResponse.json({ remaining: 0 })

  const auth = await getEditAuth(request, slug)
  if (!auth.ok || !auth.userId) return NextResponse.json({ remaining: 0 })

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('users')
    .select('gifts_remaining')
    .eq('id', auth.userId)
    .single()

  return NextResponse.json({ remaining: data?.gifts_remaining || 0 })
}
