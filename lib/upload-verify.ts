/**
 * HEAD-check a freshly-uploaded URL with short backoff.
 *
 * Why retries: Supabase Storage's public CDN doesn't always have a file
 * reachable at its public URL the instant the upload PUT returns 200.
 * /api/upload/register fires HEAD immediately after upload, and a single
 * 404 here would reject every otherwise-valid upload during a propagation
 * window of ~100–800ms. Three quick retries with linear backoff cover
 * the realistic CDN-propagation tail without making the success path slower.
 *
 * The retry only kicks in on non-2xx OR network errors. A successful HEAD
 * exits immediately — so the happy path stays single-shot.
 */

export interface HeadRetryOpts {
  attempts?: number          // total attempts (default 4)
  initialDelayMs?: number    // first delay (default 200ms; doubles each retry)
  fetchImpl?: typeof fetch   // injected for tests
}

export async function headWithRetry(url: string, opts: HeadRetryOpts = {}): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 4)
  const initial = opts.initialDelayMs ?? 200
  const fetchImpl = opts.fetchImpl ?? fetch

  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow' })
      // [DIAG] log every attempt so we can prove whether retries ever fire
      // (i.e. whether the CDN-race hypothesis is the correct layer).
      console.log('[DIAG] HEAD_ATTEMPT', { attempt: i + 1, status: res.status, ok: res.ok, url })
      if (res.ok) return res
      lastResponse = res
    } catch (err) {
      console.error('[DIAG] HEAD_THREW', { attempt: i + 1, err: (err as Error)?.message, url })
      lastError = err
    }
    if (i < attempts - 1) {
      // Linear-doubling backoff: 200, 400, 800ms by default → 1.4s tail
      // before giving up. Keeps p50 latency unchanged for healthy uploads.
      await new Promise((r) => setTimeout(r, initial * Math.pow(2, i)))
    }
  }

  if (lastResponse) return lastResponse
  throw lastError instanceof Error ? lastError : new Error('HEAD failed')
}
