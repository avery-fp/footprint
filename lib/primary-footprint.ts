import { nanoid } from 'nanoid'
import { RESERVED_SLUGS } from './constants'
import { createServerSupabaseClient } from './supabase'

interface PrimaryFootprintResult {
  id: string
  slug: string
  published: boolean
}

interface UserRecord {
  id: string
  email: string
}

function normalizeUsernameBase(email: string): string {
  const localPart = email.split('@')[0] || 'home'
  const cleaned = localPart
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return cleaned.slice(0, 20) || 'home'
}

async function findAvailablePlaceholderUsername(email: string): Promise<string> {
  const supabase = createServerSupabaseClient()
  const base = normalizeUsernameBase(email)

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `${base}-${nanoid(4).toLowerCase()}`.slice(0, 30)

    if ((RESERVED_SLUGS as readonly string[]).includes(candidate)) {
      continue
    }

    const { data: existing } = await supabase
      .from('footprints')
      .select('id')
      .eq('username', candidate)
      .maybeSingle()

    if (!existing) {
      return candidate
    }
  }

  return `fp-${nanoid(8).toLowerCase()}`
}

export async function findOrCreateUserByEmail(email: string): Promise<UserRecord | null> {
  const supabase = createServerSupabaseClient()
  const normalizedEmail = email.toLowerCase().trim()

  const { data: existingUser, error: existingUserError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingUserError) {
    console.error('[primary-footprint] user lookup failed:', existingUserError.message)
    return null
  }

  if (existingUser) {
    return existingUser
  }

  const { data: createdUser, error: createdUserError } = await supabase
    .from('users')
    .insert({ email: normalizedEmail })
    .select('id, email')
    .single()

  if (createdUserError || !createdUser) {
    console.error('[primary-footprint] user create failed:', createdUserError?.message)
    return null
  }

  return createdUser
}

export async function ensurePrimaryFootprintForUser(userId: string): Promise<PrimaryFootprintResult | null> {
  const supabase = createServerSupabaseClient()

  const { data: primaryFootprint, error: primaryFootprintError } = await supabase
    .from('footprints')
    .select('id, username, published')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .maybeSingle()

  if (primaryFootprintError) {
    console.error('[primary-footprint] primary lookup failed:', primaryFootprintError.message)
    return null
  }

  if (primaryFootprint) {
    return {
      id: primaryFootprint.id,
      slug: primaryFootprint.username,
      published: primaryFootprint.published !== false,
    }
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle()

  if (userError || !user) {
    console.error('[primary-footprint] user lookup failed:', userError?.message)
    return null
  }

  const { data: existingFootprints, error: existingFootprintsError } = await supabase
    .from('footprints')
    .select('id, username, published')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingFootprintsError) {
    console.error('[primary-footprint] footprint lookup failed:', existingFootprintsError.message)
    return null
  }

  const existingFootprint = existingFootprints?.[0]

  if (existingFootprint) {
    const { error: promoteError } = await supabase
      .from('footprints')
      .update({ is_primary: true })
      .eq('id', existingFootprint.id)

    if (promoteError) {
      console.error('[primary-footprint] failed to promote footprint:', promoteError.message)
      return null
    }

    await supabase
      .from('footprints')
      .update({ is_primary: false })
      .eq('user_id', userId)
      .neq('id', existingFootprint.id)
      .eq('is_primary', true)

    return {
      id: existingFootprint.id,
      slug: existingFootprint.username,
      published: existingFootprint.published !== false,
    }
  }

  const username = await findAvailablePlaceholderUsername(user.email)
  const { data: createdFootprint, error: createdFootprintError } = await supabase
    .from('footprints')
    .insert({
      user_id: user.id,
      username,
      display_name: '',
      is_primary: true,
      published: false,
    })
    .select('id, username, published')
    .single()

  if (createdFootprintError || !createdFootprint) {
    console.error('[primary-footprint] footprint create failed:', createdFootprintError?.message)
    return null
  }

  return {
    id: createdFootprint.id,
    slug: createdFootprint.username,
    published: createdFootprint.published !== false,
  }
}
