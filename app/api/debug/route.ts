import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const results: Record<string, unknown> = {}

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Query footprints with select('*') to see actual columns
    const t1 = await supabase.from('footprints').select('*').limit(3)
    results.footprintsSelectAll = {
      data: t1.data,
      error: t1.error,
      columns: t1.data?.[0] ? Object.keys(t1.data[0]) : null,
    }

    // 2. Find demo user
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', 'demo@footprint.onl')
      .maybeSingle()
    results.demoUser = user

    // 3. If user found, try insert with same shape as signup
    if (user) {
      const insertPayload = {
        user_id: user.id,
        username: 'debug-test-delete-me',
        name: 'Everything',
        is_primary: true,
        published: false,
      }
      results.insertPayload = insertPayload

      const { data: inserted, error: insertErr } = await supabase
        .from('footprints')
        .insert(insertPayload)
        .select('*')
        .single()

      results.insertResult = { data: inserted, error: insertErr }

      // Clean up if it succeeded
      if (inserted) {
        await supabase.from('footprints').delete().eq('username', 'debug-test-delete-me')
        results.cleanedUp = true
      }
    }

  } catch (err: any) {
    results.exception = { message: err.message }
  }

  return NextResponse.json(results)
}
