import { createClient } from '@supabase/supabase-js';
import { scanReddit } from '@/src/fp/agents/scanner';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );
    }
    return _supabase;
}

export async function getReactorState() {
    const { data: state, error: stateErr } = await getSupabase()
        .from('aro_reactor_state')
        .select('*')
        .eq('id', 'primary')
        .single();
    if (stateErr) throw new Error(`Failed to fetch reactor state: ${stateErr.message}`);

    const { data: recentJobs } = await getSupabase()
        .from('aro_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    return { ...state, recent_jobs: recentJobs || [] };
}

export async function setReactorActive(active: boolean) {
    const { error } = await getSupabase()
        .from('aro_reactor_state')
        .update({ is_active: active })
        .eq('id', 'primary');
    if (error) throw new Error(`Failed to update reactor state: ${error.message}`);
}

export async function getReactorLogs(limit: number = 50) {
    const { data, error } = await getSupabase()
        .from('aro_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw new Error(`Failed to fetch reactor logs: ${error.message}`);
    return data || [];
}

export async function runEngine(force = false) {
    const startTime = Date.now();
    const result: any = { status: 'started', errors: [] };

    try {
        // State check
        const { data: state } = await getSupabase().from('aro_reactor_state').select('is_active').eq('id', 'primary').single();
        if (!force && (!state || !state.is_active)) {
            return { status: 'skipped', reason: 'reactor paused' };
        }

        const { data: job, error: jobErr } = await getSupabase().from('aro_jobs').insert({ status: 'running' }).select().single();
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

            await getSupabase().from('aro_seeds').insert({
                id: sid,
                surface_url: thread.thread_url,
                comment_text: comment_text,
                status: 'pending'
            });
            seedsQueued++;
        }

        result.seedsQueued = seedsQueued;
        await getSupabase().from('aro_jobs').update({
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
