import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from './supabase'

/**
 * edit-token auth — the only auth this app has.
 *
 * Constitutional law: every identity or authorization check must trace, in one
 * hop, to either a Stripe-verified email or an edit_token issued against one.
 * This module implements the edit_token side.
 *
 * A caller proves ownership of a claimed footprint by presenting the
 * edit_token that was issued when the footprint was paid for.
 *
 * Token channels (priority order):
 *   1. ?token= query param   (first-use, from Stripe success URL or email link)
 *   2. fp_edit_{slug} cookie (set after first valid use)
 *   3. X-Edit-Token header   (programmatic access)
 *
 * Drafts (username starts with "draft-") have no edit_token. Knowledge of
 * the unguessable draft slug is the credential for the draft phase — auth
 * returns ok:true with a null userId for those rows.
 */

export type EditAuthResult =
  | { ok: true; userId: string | null; slug: string; isDraft: boolean }
  | { ok: false }

export function editCookieName(slug: string): string {
  return `fp_edit_${slug}`
}

export function isDraftSlug(slug: string): boolean {
  return typeof slug === 'string' && slug.startsWith('draft-')
}

export const EDIT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export const EDIT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: EDIT_COOKIE_MAX_AGE,
}

/**
 * Extract a candidate token for {slug} from the request.
 * Returns null if no token is present on any channel.
 */
export function extractEditToken(request: NextRequest | Request, slug: string): string | null {
  const url = new URL((request as Request).url)
  const fromQuery = url.searchParams.get('token')
  if (fromQuery) return fromQuery

  const asNext = request as NextRequest
  const fromCookieJar = asNext.cookies?.get?.(editCookieName(slug))?.value ?? null
  if (fromCookieJar) return fromCookieJar

  const rawCookie = request.headers.get('cookie') || ''
  const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${editCookieName(slug)}=([^;]+)`))
  if (match) return decodeURIComponent(match[1])

  return request.headers.get('x-edit-token')
}

/**
 * Verify that {token} is the current edit_token for the footprint at {slug}.
 * For draft slugs, returns ok without requiring a token (knowledge of the
 * unguessable slug is sufficient).
 *
 * On rejection, logs the specific reason so prod 401s are diagnosable in
 * Vercel logs without redeploying with extra instrumentation.
 */
export async function verifyEditToken(slug: string, token: string | null): Promise<EditAuthResult> {
  if (!slug) {
    console.error('[edit-auth] reject: empty slug')
    return { ok: false }
  }

  const db = createServerSupabaseClient()
  const { data, error } = await db
    .from('footprints')
    .select('edit_token, user_id, username')
    .eq('username', slug)
    .maybeSingle()

  if (error) {
    console.error('[edit-auth] reject: DB error looking up slug', { slug, code: error.code, message: error.message })
    return { ok: false }
  }

  if (!data) {
    console.error('[edit-auth] reject: no footprint row for slug', { slug })
    return { ok: false }
  }

  // Draft footprint: anonymous, slug-as-credential.
  if (isDraftSlug(slug)) {
    if (data.edit_token === null && data.user_id === null) {
      return { ok: true, userId: null, slug, isDraft: true }
    }
    console.error('[edit-auth] reject: draft slug but row has claim state', {
      slug,
      has_edit_token: data.edit_token !== null,
      has_user_id: data.user_id !== null,
    })
    return { ok: false }
  }

  // Claimed footprint: edit_token must match.
  if (!data.edit_token) {
    console.error('[edit-auth] reject: claimed slug with no edit_token in DB', { slug })
    return { ok: false }
  }
  if (!token) {
    console.error('[edit-auth] reject: no token presented for claimed slug', { slug })
    return { ok: false }
  }
  if (data.edit_token !== token) {
    console.error('[edit-auth] reject: token mismatch', { slug })
    return { ok: false }
  }
  if (!data.user_id) {
    console.error('[edit-auth] reject: claimed slug missing user_id', { slug })
    return { ok: false }
  }

  return { ok: true, userId: data.user_id, slug, isDraft: false }
}

/**
 * Entry point: verify a request is authorized to edit {slug}.
 */
export async function getEditAuth(request: NextRequest | Request, slug: string): Promise<EditAuthResult> {
  const token = extractEditToken(request, slug)
  return verifyEditToken(slug, token)
}

/**
 * Resolve slug from a footprint_id (UUID) and then verify edit auth.
 * For legacy routes that pass footprint_id instead of slug.
 */
export async function getEditAuthForFootprintId(
  request: NextRequest | Request,
  footprintId: string
): Promise<EditAuthResult> {
  const db = createServerSupabaseClient()
  const { data } = await db
    .from('footprints')
    .select('username')
    .eq('id', footprintId)
    .maybeSingle()
  if (!data?.username) return { ok: false }
  return getEditAuth(request, data.username)
}
