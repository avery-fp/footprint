import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    stripe_key_set: !!process.env.STRIPE_SECRET_KEY,
    stripe_key_prefix: process.env.STRIPE_SECRET_KEY?.substring(0, 7) || 'MISSING',
    app_url: process.env.NEXT_PUBLIC_APP_URL || 'MISSING',
    supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  })
}
