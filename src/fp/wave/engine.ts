import { createClient } from '@supabase/supabase-js';
import { scanReddit } from '@/src/fp/scanner';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function runEngine(force = false) {
    const startTime = Date.now();
    const result: any = { status: 'started', errors: [] };

    try {
        // State check
        const { data: state } = await supabase.from('aro_reactor_state').select('is_active').eq('id', 'primary').single();
        if (!force && (!state || !state.is_active)) {
            return { status: 'skipped', reason: 'reactor paused' };
        }

        const { data: job, error: jobErr } = await supabase.from('aro_jobs').insert({ status: 'running' }).select().single();
        if (jobErr) throw new Error(`aro_jobs insert failed: ${jobErr.message}`);
        result.jobId = job.id;

        // 1. SCAN THE HEAT
        const threads = await scanReddit();
        result.targetsFound = threads.length;

        // 2. GENERATE UNIQUE PAYLOADS (Bypass Dedupe Wall)
        let seedsQueued = 0;
        for (const thread of threads) {
            const sid = crypto.randomUUID();
            const payloads = [
                `the standard. footprint.onl?sid=${sid}`,
                `found the source. footprint.onl?sid=${sid}`,
                `the grid. footprint.onl?sid=${sid}`,
                `footprint.onl?sid=${sid} iykyk`
            ];
            const comment_text = payloads[Math.floor(Math.random() * payloads.length)];

            await supabase.from('aro_seeds').insert({
                id: sid,
                surface_url: thread.url,
                comment_text: comment_text,
                status: 'pending'
            });
            seedsQueued++;
        }

        result.seedsQueued = seedsQueued;
        await supabase.from('aro_jobs').update({
            status: 'completed',
            threads_found: result.targetsFound,
            seeds_generated: seedsQueued,
            completed_at: new Date().toISOString()
        }).eq('id', job.id);

        result.status = 'completed';
    } catch (e: any) {
        result.status = 'failed';
        result.errors.push(e.message);
    }

    result.durationMs = Date.now() - startTime;
    return result;
}
