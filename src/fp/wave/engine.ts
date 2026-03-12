import { createClient } from '@supabase/supabase-js';
import { scanReddit } from '../scanner';
import { generateComments } from '../postpack';
import crypto from 'crypto';

const env: any = {};
const envPath = require('path').resolve(process.cwd(), '.env.local');
if (require('fs').existsSync(envPath)) {
    require('fs').readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && val.length > 0) env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
    });
}

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function runEngine(force = false) {
    const startTime = Date.now();
    const result: any = { status: 'started', errors: [] };

    try {
        // Only check pause state if NOT forced
        if (!force) {
            const { data: state } = await supabase.from('aro_reactor_state').select('is_active').eq('is_active', true).limit(1);
            if (!state || state.length === 0) {
                return { status: 'skipped', reason: 'reactor paused' };
            }
        }

        const { data: job } = await supabase.from('aro_jobs').insert({ status: 'running' }).select().single();
        result.jobId = job.id;

        const threads = await scanReddit();
        result.targetsFound = threads.length;

        const comments = await generateComments(threads);
        result.commentsGenerated = comments.length;

        let seedsQueued = 0;
        for (const comment of comments) {
            const hash = crypto.createHash('sha256').update(comment.comment_text).digest('hex');
            const { error: hashErr } = await supabase.from('aro_content_hashes').insert({ content_hash: hash });
            
            if (!hashErr) {
                await supabase.from('aro_seeds').insert({
                    surface_url: comment.surface_url,
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
