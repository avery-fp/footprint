import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const { error } = await admin
    .from('aro_seeds')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) {
    return jsonError(`aro_seeds update failed: ${error.message}`, 500);
  }

  return NextResponse.json({ ok: true });
}
