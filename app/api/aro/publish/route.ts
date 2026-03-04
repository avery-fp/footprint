import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/src/aro/lib/supa';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse('Unauthorized', { status: 401 });
  if (process.env.PUBLISH_MODE !== 'live') return new NextResponse('Not Live', { status: 204 });

  const now = Date.now();
  const { data: lock } = await supabaseAdmin.from('aro_locks').select('*').eq('key', 'publish').maybeSingle();
  if (lock && now - Number(lock.timestamp) < 60000) return new NextResponse('Locked', { status: 204 });
  await supabaseAdmin.from('aro_locks').upsert({ key: 'publish', timestamp: now });

  try {
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin.from('aro_seeds').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', yesterday);
    if ((count || 0) >= Number(process.env.PUBLISH_DAILY_CAP || 50)) return new NextResponse('Cap Reached', { status: 204 });

    const interval = Number(process.env.MIN_INTERVAL_MS || 600000);
    const { data: last } = await supabaseAdmin.from('aro_seeds').select('sent_at').eq('status', 'sent').order('sent_at', { ascending: false }).limit(1).maybeSingle();
    if (last?.sent_at && (now - new Date(last.sent_at).getTime() < interval)) return new NextResponse('Pacing', { status: 204 });

    const { data: seed } = await supabaseAdmin.from('aro_seeds').select('id, copy_text, aro_surfaces(url)').eq('status', 'queued').order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!seed) return new NextResponse('No Seeds', { status: 204 });

    const surfaceUrl = Array.isArray(seed.aro_surfaces) ? seed.aro_surfaces[0]?.url : (seed.aro_surfaces as any)?.url;

    return NextResponse.json({ id: seed.id, surface_url: surfaceUrl, copy_text: seed.copy_text });
  } finally {
    await supabaseAdmin.from('aro_locks').delete().eq('key', 'publish');
  }
}
