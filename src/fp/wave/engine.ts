import { createServerSupabaseClient } from '@/lib/supabase';
import { scanReddit } from '@/src/fp/agents/scanner';
import { generateComments } from '@/src/fp/agents/postpack';
import crypto from 'crypto';

function getSupabase() {
    return createServerSupabaseClient();
}

export async function getReactorState() {
    const supabase = getSupabase();
    const { data: reactor } = await supabase
        .from('aro_reactor_state')
        .select('*')
        .eq('id', 'singleton')
        .single();

    const { data: recentJobs } = await supabase
        .from('aro_jobs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5);

    return {
        active: reactor?.active ?? false,
        updatedAt: reactor?.updated_at,
        recentJobs: recentJobs ?? [],
    };
}

export async function setReactorActive(active: boolean) {
    const supabase = getSupabase();
    await supabase
        .from('aro_reactor_state')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', 'singleton');
}

export async function getReactorLogs(limit: number = 50) {
    const supabase = getSupabase();
    const { data } = await supabase
        .from('aro_jobs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
    return data ?? [];
}

export async function runEngine(force = false) {
    const supabase = getSupabase();
    const startTime = Date.now();
    const result: any = { status: 'started', errors: [] };

    try {
        // Only check pause state if NOT forced
        if (!force) {
            const { data: state } = await supabase.from('aro_reactor_state').select('active').eq('active', true).limit(1);
            if (!state || state.length === 0) {
                return { status: 'skipped', reason: 'reactor paused' };
            }
        }

        const { data: job } = await supabase.from('aro_jobs').insert({ status: 'running' }).select().single();
        result.jobId = job.id;

        const threads = await scanReddit();
        result.targetsFound = threads.length;

        const roomUrl = process.env.FP_ROOM_URL || 'footprint.onl/ae';
        const comments = await generateComments(threads, roomUrl);
        result.commentsGenerated = comments.length;

        let seedsQueued = 0;
        for (const comment of comments) {
            const hash = crypto.createHash('sha256').update(comment.comment_text).digest('hex');
            const { error: hashErr } = await supabase.from('aro_content_hashes').insert({ hash });

            if (!hashErr) {
                await supabase.from('aro_seeds').insert({
                    surface_url: comment.target_url,
                    comment_text: comment.comment_text,
                    status: 'pending'
                });
                seedsQueued++;
            }
        }

        result.seedsQueued = seedsQueued;
        await supabase.from('aro_jobs').update({
            status: 'completed',
            surfaces_scanned: 1,
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
