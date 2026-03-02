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

    // Find quantum-test user
    const { data: user } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', 'quantum@footprint.onl')
      .maybeSingle()
    results.quantumUser = user

    // Check if quantum-test footprint exists
    const { data: fp, error: fpErr } = await supabase
      .from('footprints')
      .select('*')
      .eq('username', 'quantum-test')
      .maybeSingle()
    results.quantumFootprint = { data: fp, error: fpErr }

    // Try the EXACT insert the new signup code does
    if (user && !fp) {
      const insertPayload = {
        user_id: user.id,
        username: 'quantum-test',
        display_name: 'quantum-test',
        email: 'quantum@footprint.onl',
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

      // Clean up
      if (inserted) {
        await supabase.from('footprints').delete().eq('username', 'quantum-test')
        results.cleanedUp = true
      }
    }

  } catch (err: any) {
    results.exception = { message: err.message }
  }

  return NextResponse.json(results)
}
