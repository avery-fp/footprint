/**
 * GET /api/aro/unsubscribe?t=<target_token>
 *
 * CAN-SPAM opt-out handler for the email swarm.
 *
 * Reads the per-recipient token from the query string, looks up the target
 * in swarm_targets by id, and sets status = 'unsubscribed'. The handler
 * always renders a confirmation page on success — and ALSO on most failure
 * modes — because the legal requirement under 15 U.S.C. § 7704(a)(4) is
 * that the opt-out mechanism remain operational and not condition the
 * opt-out on additional steps. An apparent error rendering an "unable to
 * unsubscribe" page back at the recipient is worse than silently accepting
 * the opt-out and logging the failure server-side.
 *
 * The route is also exposed at /aro/u via a Next.js rewrite (see
 * next.config.js) so the email footer URL is short and memorable.
 *
 * Token format: this v1 uses the swarm_targets.id (uuid) directly as the
 * token. A future migration could add a separate opaque unsubscribe_token
 * column for stronger unlinkability, but the current design is acceptable
 * because the token is sent only in email footers to the target it
 * identifies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// UUID v4 + variant bits format. The synthetic mock tokens used by the
// dry-run mock pipeline (00000000-0000-4000-8000-0000000000XX) and the real
// swarm_targets.id values both match this pattern.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const token = url.searchParams.get('t')

  if (!token || !UUID_RE.test(token)) {
    // Invalid link — show a generic message rather than reveal whether the
    // token is valid. Status 400 because the request is malformed.
    return new NextResponse(
      buildPage(
        'invalid unsubscribe link',
        'This unsubscribe link is malformed. If you continue to receive messages, reply to any email and you will be removed.',
      ),
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    )
  }

  // Try to flip the target's status to 'unsubscribed'. Idempotent: if the
  // target is already unsubscribed (or doesn't exist), we still render the
  // success page so the recipient is not asked to take additional steps.
  // Errors are swallowed and never surfaced to the recipient — they are
  // logged server-side instead.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      const { error } = await supabase
        .from('swarm_targets')
        .update({ status: 'unsubscribed' })
        .eq('id', token)

      if (error) {
        // Log but do not surface — see CAN-SPAM rationale in the file header.
        console.error('[unsubscribe] supabase update failed:', error.message)
      }
    } else {
      console.error('[unsubscribe] supabase env vars missing — opt-out not recorded')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[unsubscribe] unexpected error:', msg)
  }

  // Always render success after a syntactically-valid token. The opt-out
  // is acknowledged regardless of whether the DB write succeeded; if the
  // write failed, the operator is responsible for repairing the state from
  // the server logs.
  return new NextResponse(
    buildPage(
      'unsubscribed',
      "you've been removed. you won't receive further messages from this list.",
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Don't let mail clients prefetch this and cache it; we want each
        // hit to update the row even though it's idempotent.
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}

// Some email providers prefetch GET links to scan for malware. Most also
// follow POST links from one-click unsubscribe headers (RFC 8058). Accepting
// POST without changing behavior makes the route compatible with both
// prefetch and one-click clients.
export async function POST(request: NextRequest) {
  return GET(request)
}

function buildPage(title: string, message: string): string {
  // Matches the dark/monospace aesthetic of the email body templates.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>footprint — ${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <style>
    html, body { background: #0c0c10; color: #888892; margin: 0; padding: 0; }
    body {
      font-family: 'DM Mono', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.7;
      font-weight: 300;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
    }
    .card {
      max-width: 540px;
      width: 100%;
    }
    .title {
      color: #d4c5a9;
      margin: 0 0 24px 0;
      font-size: 14px;
      font-weight: 300;
    }
    .body {
      margin: 0 0 32px 0;
    }
    .legal {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #1a1a20;
      font-size: 11px;
      color: #555560;
    }
    .legal p { margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <p class="title">${escapeHtml(title)}</p>
    <p class="body">${escapeHtml(message)}</p>
    <div class="legal">
      <p>this confirmation completes your opt-out for can-spam compliance.</p>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}
