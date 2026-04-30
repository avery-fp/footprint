import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  createOwnerSession,
  normalizeOwnerIdentifier,
  OWNER_SESSION_COOKIE,
  OWNER_KEY_RE,
  ownerSessionCookieOptions,
  verifyOwnerKey,
} from '@/lib/owner-return'

export const dynamic = 'force-dynamic'

const GENERIC_ERROR = 'couldn’t open'
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return failed()
  }

  const identifier = normalizeOwnerIdentifier(body?.identifier)
  const ownerKey = typeof body?.ownerKey === 'string' ? body.ownerKey.trim() : ''
  if (!identifier || !OWNER_KEY_RE.test(ownerKey)) return failed()

  const supabase = createServerSupabaseClient()
  let query = supabase
    .from('footprints')
    .select('username, serial_number, user_id, edit_token, owner_key_hash, owner_key_failed_attempts, owner_key_locked_until')
    .not('edit_token', 'is', null)

  query = identifier.kind === 'slug'
    ? query.eq('username', identifier.slug)
    : query.eq('serial_number', identifier.serial)

  const { data: footprint, error } = await query.maybeSingle()
  if (error || !footprint?.username || !footprint?.serial_number || !footprint?.user_id || !footprint?.owner_key_hash) {
    return failed()
  }

  if (footprint.owner_key_locked_until && new Date(footprint.owner_key_locked_until).getTime() > Date.now()) {
    return failed()
  }

  const ok = await verifyOwnerKey(ownerKey, footprint.owner_key_hash)
  if (!ok) {
    const attempts = (footprint.owner_key_failed_attempts || 0) + 1
    await supabase
      .from('footprints')
      .update({
        owner_key_failed_attempts: attempts,
        owner_key_locked_until: attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MS).toISOString()
          : null,
      })
      .eq('username', footprint.username)
    return failed()
  }

  await supabase
    .from('footprints')
    .update({ owner_key_failed_attempts: 0, owner_key_locked_until: null })
    .eq('username', footprint.username)

  const destination = `/${footprint.username}/home`
  const response = NextResponse.json({ destination })
  response.cookies.set(
    OWNER_SESSION_COOKIE,
    createOwnerSession(footprint.username, footprint.serial_number),
    ownerSessionCookieOptions()
  )
  return response
}

function failed() {
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 })
}
