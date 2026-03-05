import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envOrError(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

let _admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      envOrError('NEXT_PUBLIC_SUPABASE_URL'),
      envOrError('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }
  return _admin;
}

/** Quick check that a table exists and is queryable. */
async function tableExists(admin: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select('*', { count: 'exact', head: true }).limit(0);
  // Supabase returns 404-class PGRST error when the table doesn't exist
  return !error;
}

// ---------------------------------------------------------------------------
// GET  — fetch next queued seed for operator.js
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // --- env guards ---
  let admin: SupabaseClient;
  try {
    admin = getAdmin();
  } catch (e: any) {
    return jsonError(e.message, 500);
  }

  if (!process.env.CRON_SECRET) {
    return jsonError('Missing env var: CRON_SECRET', 500);
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonError('Unauthorized', 401);
  }

  if (process.env.PUBLISH_MODE !== 'live') {
    return NextResponse.json({ skipped: true, reason: 'PUBLISH_MODE is not live' }, { status: 204 });
  }

  // --- table guards ---
  const required = ['aro_locks', 'aro_seeds', 'aro_surfaces'] as const;
  for (const t of required) {
    if (!(await tableExists(admin, t))) {
      return jsonError(
        `Table "${t}" does not exist. Run the 009_aro_publish_tables migration.`,
        500,
      );
    }
  }

  // --- lock ---
  const now = Date.now();
  const { data: lock, error: lockErr } = await admin
    .from('aro_locks')
    .select('*')
    .eq('key', 'publish')
    .maybeSingle();

  if (lockErr) return jsonError(`aro_locks read failed: ${lockErr.message}`, 500);

  if (lock && now - Number(lock.timestamp) < 60000) {
    return NextResponse.json({ skipped: true, reason: 'locked' }, { status: 204 });
  }

  const { error: upsertErr } = await admin
    .from('aro_locks')
    .upsert({ key: 'publish', timestamp: now });

  if (upsertErr) return jsonError(`aro_locks upsert failed: ${upsertErr.message}`, 500);

  try {
    // --- daily cap ---
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: capErr } = await admin
      .from('aro_seeds')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', yesterday);

    if (capErr) return jsonError(`aro_seeds cap query failed: ${capErr.message}`, 500);

    const dailyCap = Number(process.env.PUBLISH_DAILY_CAP || 50);
    if ((count || 0) >= dailyCap) {
      return NextResponse.json({ skipped: true, reason: 'daily cap reached', count, dailyCap }, { status: 204 });
    }

    // --- pacing ---
    const interval = Number(process.env.MIN_INTERVAL_MS || 600000);
    const { data: last, error: paceErr } = await admin
      .from('aro_seeds')
      .select('sent_at')
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paceErr) return jsonError(`aro_seeds pacing query failed: ${paceErr.message}`, 500);

    if (last?.sent_at && now - new Date(last.sent_at).getTime() < interval) {
      return NextResponse.json({ skipped: true, reason: 'pacing' }, { status: 204 });
    }

    // --- pick next seed ---
    const { data: seed, error: seedErr } = await admin
      .from('aro_seeds')
      .select('id, copy_text, aro_surfaces(url)')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (seedErr) return jsonError(`aro_seeds select failed: ${seedErr.message}`, 500);
    if (!seed) return NextResponse.json({ skipped: true, reason: 'no queued seeds' }, { status: 204 });

    const surfaceUrl = Array.isArray(seed.aro_surfaces)
      ? seed.aro_surfaces[0]?.url
      : (seed.aro_surfaces as any)?.url;

    return NextResponse.json({ id: seed.id, surface_url: surfaceUrl, copy_text: seed.copy_text });
  } finally {
    await admin.from('aro_locks').delete().eq('key', 'publish');
  }
}
