import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getUserIdFromRequest } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendGiftEmail } from '@/lib/gifts'

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const emails: string[] = body.emails

  if (!Array.isArray(emails) || emails.length === 0 || emails.length > 2) {
    return NextResponse.json({ error: 'Provide 1-2 email addresses' }, { status: 400 })
  }

  // Validate emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const email of emails) {
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: `Invalid email: ${email}` }, { status: 400 })
    }
  }

  const supabase = createServerSupabaseClient()

  // Check gifts remaining
  const { data: user } = await supabase
    .from('users')
    .select('id, gifts_remaining, serial_number')
    .eq('id', userId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.serial_number) {
    return NextResponse.json({ error: 'Only claimed users can gift' }, { status: 403 })
  }

  if ((user.gifts_remaining || 0) < emails.length) {
    return NextResponse.json({
      error: `You have ${user.gifts_remaining || 0} gift(s) remaining`,
    }, { status: 400 })
  }

  // Check for duplicate gifts to same email
  for (const email of emails) {
    const { data: existing } = await supabase
      .from('gifts')
      .select('id')
      .eq('sender_id', userId)
      .eq('recipient_email', email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json({ error: `Already gifted to ${email}` }, { status: 400 })
    }
  }

  // Create gifts and send emails
  const results = []
  for (const email of emails) {
    const claimToken = randomBytes(32).toString('base64url')
    const { error } = await supabase.from('gifts').insert({
      sender_id: userId,
      recipient_email: email.toLowerCase().trim(),
      claim_token: claimToken,
    })

    if (error) {
      console.error('Gift insert failed:', error)
      return NextResponse.json({ error: 'Failed to create gift' }, { status: 500 })
    }

    // Send gift email (fire-and-forget)
    sendGiftEmail(email.toLowerCase().trim(), claimToken).catch(err =>
      console.error('Gift email failed:', err)
    )

    results.push({ email, sent: true })
  }

  // Decrement gifts remaining
  await supabase
    .from('users')
    .update({ gifts_remaining: (user.gifts_remaining || 0) - emails.length })
    .eq('id', userId)

  return NextResponse.json({
    success: true,
    gifts: results,
    remaining: (user.gifts_remaining || 0) - emails.length,
  })
}
