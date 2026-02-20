import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

export async function GET() {
  const result: Record<string, any> = {
    status: 'checking',
    db: false,
    stripe: false,
    tables: {
      referrals: false,
      promo_codes: false,
      login_tokens: false,
      fp_events: false,
    },
  }

  try {
    const supabase = createServerSupabaseClient()

    // Check DB connectivity
    const { error: dbError } = await supabase.from('users').select('id').limit(1)
    result.db = !dbError

    // Check required tables
    const tableNames = ['referrals', 'promo_codes', 'login_tokens', 'fp_events'] as const
    for (const table of tableNames) {
      const { error } = await supabase.from(table).select('id').limit(1)
      result.tables[table] = !error
    }

    // Check Stripe connectivity
    try {
      await stripe.products.list({ limit: 1 })
      result.stripe = true
    } catch {
      result.stripe = false
    }

    const allTablesOk = Object.values(result.tables).every(Boolean)
    result.status = result.db && result.stripe && allTablesOk ? 'ok' : 'degraded'

    return NextResponse.json(result, { status: result.status === 'ok' ? 200 : 503 })
  } catch (error: any) {
    result.status = 'error'
    return NextResponse.json(result, { status: 500 })
  }
}
