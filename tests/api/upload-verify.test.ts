import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headWithRetry } from '@/lib/upload-verify'

describe('headWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('returns immediately when HEAD succeeds on first try', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const promise = headWithRetry('https://example.com/a.jpg', { fetchImpl: fetchMock, attempts: 3, initialDelayMs: 100 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 404 and succeeds when CDN catches up', async () => {
    // Reproduces the production race: Supabase Storage PUT returns 200, but
    // public URL HEADs as 404 for the first ~500ms while the file propagates.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const promise = headWithRetry('https://example.com/a.jpg', { fetchImpl: fetchMock, attempts: 4, initialDelayMs: 100 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns the last response when all attempts fail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const promise = headWithRetry('https://example.com/a.jpg', { fetchImpl: fetchMock, attempts: 3, initialDelayMs: 50 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rethrows network errors only after exhausting retries', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const promise = headWithRetry('https://example.com/a.jpg', { fetchImpl: fetchMock, attempts: 3, initialDelayMs: 50 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
