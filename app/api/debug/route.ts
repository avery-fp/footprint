import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  const results: Record<string, unknown> = {}

  // Check env vars
  results.envVars = {
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SERVICE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SERVICE_KEY_PREFIX: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10),
    JWT_SECRET: !!process.env.JWT_SECRET,
  }

  try {
    // Test with createServerSupabaseClient (wrapper)
    const sb1 = createServerSupabaseClient()
    const t1 = await sb1.from('users').select('id').limit(1)
    results.wrapperUsersQuery = { data: t1.data, error: t1.error }

    const t2 = await sb1.from('footprints').select('id').limit(1)
    results.wrapperFootprintsQuery = { data: t2.data?.length, error: t2.error }

    // Test with direct createClient
    const sb2 = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const t3 = await sb2.from('users').select('id').limit(1)
    results.directUsersQuery = { data: t3.data, error: t3.error }

    const t4 = await sb2.from('users').select('id, email').eq('email', 'nonexistent@test.com').maybeSingle()
    results.directUsersMaybeSingle = { data: t4.data, error: t4.error }

  } catch (err: any) {
    results.exception = { message: err.message, stack: err.stack?.split('\n')[0] }
  }

  return NextResponse.json(results)
}
