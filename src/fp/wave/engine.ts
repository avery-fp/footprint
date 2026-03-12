import { createClient } from '@supabase/supabase-js';
import { scanReddit } from '../scanner';
import crypto from 'crypto';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function runEngine(force = false) {
    const startTime = Date.now();
    const result: any = { status: 'started', errors: [] };

    try {
        const { data: job } = await supabase.from('aro_jobs').insert({ status: 'running' }).select().single();
        result.jobId = job?.id;

        // 1. SCAN THE HEAT
        const threads = await scanReddit();
        result.targetsFound = threads.length;

        // 2. GENERATE VISUAL SEEDS (Bypass AI Refusal)
        let seedsQueued = 0;
        for (const thread of threads) {
            // We use the SID + Timestamp to ensure every payload is unique
            const sid = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            
            // The "Mystery Drop" logic - Visual Receipt
            const payloads = [
                `the standard. footprint.onl/ae?sid=${sid}`,
                `found the source. footprint.onl/ae?sid=${sid}`,
                `the grid. footprint.onl/ae?sid=${sid}`,
                `footprint.onl?sid=${sid} iykyk`
            ];
            
            const comment_text = payloads[Math.floor(Math.random() * payloads.length)];

            // 3. INJECT INTO DB
            await supabase.from('aro_seeds').insert({
                id: sid,
                surface_url: thread.url,
                comment_text: comment_text,
                status: 'pending',
                metadata: { timestamp, target: thread.subreddit }
            });
            seedsQueued++;
        }

        result.seedsQueued = seedsQueued;
        await supabase.from('aro_jobs').update({ 
            status: 'completed', 
            threads_found: result.targetsFound, 
            seeds_generated: seedsQueued,
            completed_at: new Date().toISOString() 
        }).eq('id', result.jobId);

        result.status = 'completed';
    } catch (e: any) {
        result.status = 'failed';
        result.errors.push(e.message);
    }

    result.durationMs = Date.now() - startTime;
    return result;
}
