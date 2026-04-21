import { NextRequest, NextResponse } from 'next/server'

// ─── Scopes ─────────────────────────────────────────────
//
// 'cron'    — scheduled jobs (ignite, publish). Accepts CRON_SECRET only.
// 'machine' — CLI tooling (mint, ingest, packs, stats…). Accepts ARO_KEY only.
//
// Admin access (fp_admin cookie matching ARO_ADMIN_SECRET) bypasses scope.

export type MachineScope = 'cron' | 'machine'

export interface AdminSession {
  email: string
}

/**
 * Admin gate: fp_admin cookie must match ARO_ADMIN_SECRET env var.
 *
 * The old JWT session auth is gone. ARO admin is now a single-secret gate
 * for the owner. If ARO needs multi-user admin later, wire it back to
 * Stripe-verified emails rather than rebuilding a session layer.
 */
export async function requireAdminSession(
  request: NextRequest
): Promise<AdminSession | NextResponse> {
  const expected = process.env.ARO_ADMIN_SECRET
  const cookie = request.cookies.get('fp_admin')?.value

  if (!expected || !cookie || cookie !== expected) {
    return NextResponse.json(
      { error: 'Forbidden: not an ARO admin' },
      { status: 403 }
    )
  }

  return { email: process.env.ARO_ADMIN_EMAIL || 'owner@footprint.onl' }
}

/**
 * Machine-to-machine bearer auth. Scoped so a leaked CRON_SECRET can't
 * impersonate a CLI key (and vice versa).
 */
export function isMachineAuthed(request: NextRequest, scope: MachineScope): boolean {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const bearer = authHeader.slice(7)

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
 * Dual auth: admin cookie OR machine bearer.
 */
export async function requireAdminOrMachine(
  request: NextRequest,
  scope: MachineScope = 'machine'
): Promise<AdminSession | 'machine' | NextResponse> {
  if (isMachineAuthed(request, scope)) {
    return 'machine'
  }
  return requireAdminSession(request)
}
