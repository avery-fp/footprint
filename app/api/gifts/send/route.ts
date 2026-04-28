import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getEditAuth } from '@/lib/edit-auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendGiftEmail } from '@/lib/gifts'

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { emails, slug } = body

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }

  const auth = await getEditAuth(request, slug)
  if (!auth.ok || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!Array.isArray(emails) || emails.length === 0 || emails.length > 2) {
    return NextResponse.json({ error: 'Provide 1-2 email addresses' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const email of emails) {
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: `Invalid email: ${email}` }, { status: 400 })
    }
  }

  const supabase = createServerSupabaseClient()

  const { data: user } = await supabase
    .from('users')
    .select('gifts_remaining')
    .eq('id', auth.userId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if ((user.gifts_remaining || 0) < emails.length) {
    return NextResponse.json({
      error: `You have ${user.gifts_remaining || 0} gift(s) remaining`,
    }, { status: 400 })
  }

  for (const email of emails) {
    const { data: existing } = await supabase
      .from('gifts')
      .select('id')
      .eq('sender_id', auth.userId)
      .eq('recipient_email', email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json({ error: `Already gifted to ${email}` }, { status: 400 })
    }
  }

  const results = []
  for (const email of emails) {
    const claimToken = randomBytes(32).toString('base64url')
    const { error } = await supabase.from('gifts').insert({
      sender_id: auth.userId,
      recipient_email: email.toLowerCase().trim(),
      claim_token: claimToken,
    })

    if (error) {
      console.error('Gift insert failed:', error)
      return NextResponse.json({ error: 'Failed to create gift' }, { status: 500 })
    }

    sendGiftEmail(email.toLowerCase().trim(), claimToken).catch(err =>
      console.error('Gift email failed:', err)
    )

    results.push({ email, sent: true })
  }

  await supabase
    .from('users')
    .update({ gifts_remaining: (user.gifts_remaining || 0) - emails.length })
    .eq('id', auth.userId)

  return NextResponse.json({
    success: true,
    gifts: results,
    remaining: (user.gifts_remaining || 0) - emails.length,
  })
}
