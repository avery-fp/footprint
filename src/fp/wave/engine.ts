/**
 * WAVE ENGINE — one-button reactor for the ARO distribution pipeline.
 *
 * Orchestrates: scan → generate → deduplicate → queue seeds → log job.
 *
 * Single entry point: `runEngine()`.
 * The engine checks reactor state before running — if paused, it bails.
 * Every cycle is logged to `aro_jobs` for observability.
 * Content hashing prevents duplicate posts.
 */

import { createHash } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { scan, type ScanTarget } from '../agents/scanner'
import { generateComments, type PostpackOutput } from '../agents/postpack'

// ─── Supabase client ─────────────────────────────────────

let _admin: SupabaseClient | null = null

function getAdmin(): SupabaseClient {
  if (_admin) return _admin

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  _admin = createClient(url, key)
  return _admin
}

// ─── Types ───────────────────────────────────────────────

export interface EngineResult {
  jobId: string
  status: 'completed' | 'failed' | 'skipped'
  reason?: string
  targetsFound: number
  commentsGenerated: number
  seedsQueued: number
  errors: string[]
  durationMs: number
}

export interface ReactorState {
  active: boolean
  lights: {
    alive: boolean
    spreading: boolean
    reward: boolean
  }
  recentJobs: JobSummary[]
}

export interface JobSummary {
  id: string
  status: string
  targets_found: number
  comments_gen: number
  seeds_queued: number
  errors: string[]
  started_at: string
  completed_at: string | null
}

// ─── Content hash for idempotency ────────────────────────

function contentHash(surfaceUrl: string, text: string): string {
  return createHash('sha256')
    .update(surfaceUrl + '||' + text)
    .digest('hex')
    .slice(0, 16)
}

// ─── Engine ──────────────────────────────────────────────

export async function runEngine(): Promise<EngineResult> {
  const start = Date.now()
  const admin = getAdmin()
  const errors: string[] = []

  // Check reactor state — bail if paused
  const { data: state } = await admin
    .from('aro_reactor_state')
    .select('active')
    .eq('id', 'singleton')
    .single()

  if (!state?.active) {
    return {
      jobId: '',
      status: 'skipped',
      reason: 'reactor paused',
      targetsFound: 0,
      commentsGenerated: 0,
      seedsQueued: 0,
      errors: [],
      durationMs: Date.now() - start,
    }
  }

  // Create job row
  const { data: job, error: jobErr } = await admin
    .from('aro_jobs')
    .insert({ status: 'running' })
    .select('id')
    .single()

  if (jobErr || !job) {
    return {
      jobId: '',
      status: 'failed',
      reason: `Failed to create job: ${jobErr?.message}`,
      targetsFound: 0,
      commentsGenerated: 0,
      seedsQueued: 0,
      errors: [jobErr?.message || 'unknown'],
      durationMs: Date.now() - start,
    }
  }

  const jobId = job.id
  let targetsFound = 0
  let commentsGenerated = 0
  let seedsQueued = 0

  try {
    // ─── Step 1: Scan for targets ─────────────────────
    let targets: ScanTarget[] = []
    try {
      targets = await scan({
        platforms: ['reddit'],
        limit: 30,
      })
      targetsFound = targets.length
    } catch (err: any) {
      errors.push(`scan: ${err.message}`)
    }

    if (targets.length === 0) {
      await finalizeJob(admin, jobId, 'completed', { targetsFound, commentsGenerated, seedsQueued, errors })
      return {
        jobId,
        status: 'completed',
        reason: 'no targets found',
        targetsFound,
        commentsGenerated,
        seedsQueued,
        errors,
        durationMs: Date.now() - start,
      }
    }

    // ─── Step 2: Generate comments ────────────────────
    let comments: PostpackOutput[] = []
    try {
      // Take top 10 targets by score for comment generation
      const topTargets = targets.slice(0, 10)
      const roomUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/ae`
        : 'https://footprint.onl/ae'

      comments = await generateComments(topTargets, roomUrl)
      commentsGenerated = comments.length
    } catch (err: any) {
      errors.push(`generate: ${err.message}`)
    }

    if (comments.length === 0) {
      await finalizeJob(admin, jobId, 'completed', { targetsFound, commentsGenerated, seedsQueued, errors })
      return {
        jobId,
        status: 'completed',
        reason: 'no comments generated',
        targetsFound,
        commentsGenerated,
        seedsQueued,
        errors,
        durationMs: Date.now() - start,
      }
    }

    // ─── Step 3: Fetch active surfaces ────────────────
    const { data: surfaces } = await admin
      .from('aro_surfaces')
      .select('id, url, platform')
      .eq('active', true)

    if (!surfaces || surfaces.length === 0) {
      errors.push('no active surfaces configured')
      await finalizeJob(admin, jobId, 'completed', { targetsFound, commentsGenerated, seedsQueued, errors })
      return {
        jobId,
        status: 'completed',
        reason: 'no active surfaces',
        targetsFound,
        commentsGenerated,
        seedsQueued,
        errors,
        durationMs: Date.now() - start,
      }
    }

    // ─── Step 4: Deduplicate + queue seeds ─────────────
    for (const comment of comments) {
      // Match comment to a surface by platform
      const surface = surfaces.find(
        (s) => s.platform === comment.platform
      ) || surfaces[0]

      const hash = contentHash(surface.url, comment.comment_text)

      // Check if already posted
      const { data: existing } = await admin
        .from('aro_content_hashes')
        .select('hash')
        .eq('hash', hash)
        .maybeSingle()

      if (existing) {
        continue // already posted — skip
      }

      // Insert seed
      const { data: seed, error: seedErr } = await admin
        .from('aro_seeds')
        .insert({
          surface_id: surface.id,
          copy_text: comment.comment_text,
          status: 'queued',
        })
        .select('id')
        .single()

      if (seedErr) {
        errors.push(`seed insert: ${seedErr.message}`)
        continue
      }

      // Record content hash
      await admin
        .from('aro_content_hashes')
        .insert({
          hash,
          surface_id: surface.id,
          seed_id: seed.id,
        })

      seedsQueued++
    }

    // ─── Step 5: Finalize job ─────────────────────────
    await finalizeJob(admin, jobId, 'completed', { targetsFound, commentsGenerated, seedsQueued, errors })

    return {
      jobId,
      status: 'completed',
      targetsFound,
      commentsGenerated,
      seedsQueued,
      errors,
      durationMs: Date.now() - start,
    }
  } catch (err: any) {
    errors.push(`engine: ${err.message}`)
    await finalizeJob(admin, jobId, 'failed', { targetsFound, commentsGenerated, seedsQueued, errors })

    return {
      jobId,
      status: 'failed',
      targetsFound,
      commentsGenerated,
      seedsQueued,
      errors,
      durationMs: Date.now() - start,
    }
  }
}

// ─── Reactor state helpers ───────────────────────────────

export async function getReactorState(): Promise<ReactorState> {
  const admin = getAdmin()

  // Reactor active state
  const { data: state } = await admin
    .from('aro_reactor_state')
    .select('active')
    .eq('id', 'singleton')
    .single()

  const active = state?.active ?? false

  // Lights
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // SPREADING: any seeds queued in last 24h
  const { count: seedCount } = await admin
    .from('aro_seeds')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued')
    .gte('created_at', oneDayAgo)

  // REWARD: any conversions in last 7d
  const { count: convCount } = await admin
    .from('fp_distribution_events')
    .select('*', { count: 'exact', head: true })
    .gt('conversions', 0)
    .gte('posted_at', oneWeekAgo)

  // Recent jobs
  const { data: jobs } = await admin
    .from('aro_jobs')
    .select('id, status, targets_found, comments_gen, seeds_queued, errors, started_at, completed_at')
    .order('started_at', { ascending: false })
    .limit(50)

  return {
    active,
    lights: {
      alive: active,
      spreading: (seedCount || 0) > 0,
      reward: (convCount || 0) > 0,
    },
    recentJobs: (jobs || []) as JobSummary[],
  }
}

export async function setReactorActive(active: boolean): Promise<void> {
  const admin = getAdmin()
  await admin
    .from('aro_reactor_state')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', 'singleton')
}

export async function getReactorLogs(limit: number = 50): Promise<JobSummary[]> {
  const admin = getAdmin()
  const { data } = await admin
    .from('aro_jobs')
    .select('id, status, targets_found, comments_gen, seeds_queued, errors, started_at, completed_at')
    .order('started_at', { ascending: false })
    .limit(limit)

  return (data || []) as JobSummary[]
}

// ─── Internal helpers ────────────────────────────────────

async function finalizeJob(
  admin: SupabaseClient,
  jobId: string,
  status: string,
  counts: { targetsFound: number; commentsGenerated: number; seedsQueued: number; errors: string[] }
): Promise<void> {
  await admin
    .from('aro_jobs')
    .update({
      status,
      targets_found: counts.targetsFound,
      comments_gen: counts.commentsGenerated,
      seeds_queued: counts.seedsQueued,
      errors: counts.errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}
