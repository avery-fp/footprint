import { NextRequest, NextResponse } from 'next/server'
import { generateMagicLink, sendMagicLinkEmail } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { magicLinkSchema } from '@/lib/schemas'
import { validateBody } from '@/lib/validate'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('POST', '/api/auth/magic-link')

// In-memory rate limiter: max 5 requests per email per 15 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

/**
 * POST /api/auth/magic-link
 *
 * Generates and sends a magic link for passwordless auth.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const v = validateBody(magicLinkSchema, body)
    if (!v.success) return v.response
    const { email, redirect } = v.data

    // Rate limit: prevent email bombing and enumeration
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`email:${email}`) || !checkRateLimit(`ip:${ip}`)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    // Use service role client to bypass RLS for user lookup
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user exists (i.e., has paid) — case-insensitive
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .ilike('email', email)
      .single()

    if (userError || !user) {
      // User hasn't paid yet
      return NextResponse.json(
        { error: 'No account found. Get your Footprint first!' },
        { status: 404 }
      )
    }

    // Generate the magic link
    const magicLink = await generateMagicLink(email)

    // Add redirect param if provided
    const finalLink = redirect
      ? `${magicLink}&redirect=${encodeURIComponent(redirect)}`
      : magicLink

    // Send the email
    await sendMagicLinkEmail(email, finalLink)

    return NextResponse.json({ success: true })

  } catch (error) {
    log.error({ err: error }, 'Magic link failed')

    // Don't expose internal error details to clients
    return NextResponse.json(
      { error: 'Failed to send magic link' },
      { status: 500 }
    )
  }
}
