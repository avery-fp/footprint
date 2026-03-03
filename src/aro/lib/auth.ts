import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

// ─── Scopes ─────────────────────────────────────────────
//
// 'cron'    — scheduled jobs (ignite, publish). Accepts CRON_SECRET only.
// 'machine' — CLI tooling (mint, ingest, packs, stats…). Accepts ARO_KEY only.
//
// Admin session auth (fp_session cookie) bypasses scope — admins can call anything.

export type MachineScope = 'cron' | 'machine'

/**
 * Admin email allowlist.
 *
 * ONLY these emails can access ARO admin routes via session auth.
 * Loaded from env (comma-separated) with a compile-time fallback.
 */
function getAdminEmails(): string[] {
  const envList = process.env.ARO_ADMIN_EMAILS
  if (envList) {
    return envList.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  }
  // Fallback: owner only
  return ['nickocorder@gmail.com']
}

export interface AdminSession {
  userId: string
  email: string
}

/**
 * Verify the incoming request has a valid fp_session cookie
 * AND the session email is in the admin allowlist.
 *
 * Returns the verified session or a NextResponse error.
 */
export async function requireAdminSession(
  request: NextRequest
): Promise<AdminSession | NextResponse> {
  const token = request.cookies.get('fp_session')?.value

  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const session = await verifySessionToken(token)

  if (!session) {
    return NextResponse.json(
      { error: 'Invalid or expired session' },
      { status: 401 }
    )
  }

  const admins = getAdminEmails()
  if (!admins.includes(session.email.toLowerCase())) {
    return NextResponse.json(
      { error: 'Forbidden: not an ARO admin' },
      { status: 403 }
    )
  }

  return { userId: session.userId, email: session.email }
}

/**
 * Check whether the request carries a valid machine-to-machine secret
 * via the Authorization header ONLY, scoped to the intended use.
 *
 * scope='cron'    → accepts CRON_SECRET only
 * scope='machine' → accepts ARO_KEY only
 *
 * If a CRON_SECRET bearer hits a 'machine' route, it's rejected (and vice versa).
 * This limits blast radius if either secret leaks.
 *
 * NEVER reads secrets from URL query params or request body.
 */
export function isMachineAuthed(request: NextRequest, scope: MachineScope): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const bearer = authHeader.slice(7) // strip "Bearer "

  if (scope === 'cron') {
    const cronSecret = process.env.CRON_SECRET
    return !!(cronSecret && bearer === cronSecret)
  }

  if (scope === 'machine') {
    const aroKey = process.env.ARO_KEY
    return !!(aroKey && bearer === aroKey)
  }

  return false
}

/**
 * Dual auth: require EITHER a valid admin session OR a scoped machine secret.
 *
 * scope='cron'    — for scheduled job endpoints (CRON_SECRET)
 * scope='machine' — for CLI/tooling endpoints (ARO_KEY)
 *
 * Admin session auth works for ALL scopes (owner can always call anything).
 *
 * Returns:
 *   - AdminSession   if human-authenticated
 *   - 'machine'      if machine-authenticated (scoped)
 *   - NextResponse   if neither (401/403)
 */
export async function requireAdminOrMachine(
  request: NextRequest,
  scope: MachineScope = 'machine'
): Promise<AdminSession | 'machine' | NextResponse> {
  // Try scoped machine auth first (no DB call needed)
  if (isMachineAuthed(request, scope)) {
    return 'machine'
  }

  // Fall back to session auth (admins bypass scope)
  return requireAdminSession(request)
}
