import { describe, it, expect, vi } from 'vitest'

// Stub fetch to prevent real network calls
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')))

// Import the route handler after stubbing
import { POST } from '@/app/api/media/resolve/route'
import { NextRequest } from 'next/server'

function makeRequest(body: any): NextRequest {
  return new NextRequest('http://localhost:3000/api/media/resolve', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/media/resolve', () => {
  it('resolves a YouTube URL', async () => {
    const req = makeRequest({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.kind).toBe('video')
    expect(data.provider).toBe('youtube')
    expect(data.renderMode).toBe('embed')
    expect(data.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('resolves a Spotify URL', async () => {
    const req = makeRequest({ url: 'https://open.spotify.com/track/abc123' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.kind).toBe('music')
    expect(data.provider).toBe('spotify')
    expect(data.renderMode).toBe('preview_card')
  })

  it('resolves an Apple Music URL', async () => {
    const req = makeRequest({ url: 'https://music.apple.com/us/album/good-album/123' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.kind).toBe('music')
    expect(data.provider).toBe('apple_music')
    expect(data.renderMode).toBe('preview_card')
  })

  it('returns 400 for missing URL', async () => {
    const req = makeRequest({})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-string URL', async () => {
    const req = makeRequest({ url: 123 })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for javascript: protocol', async () => {
    const req = makeRequest({ url: 'javascript:alert(1)' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for data: protocol', async () => {
    const req = makeRequest({ url: 'data:text/html,<script>alert(1)</script>' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('sets cache headers on success', async () => {
    const req = makeRequest({ url: 'https://example.com' })
    const res = await POST(req)
    expect(res.headers.get('Cache-Control')).toContain('max-age=86400')
  })

  it('returns complete IdentifiedMedia shape', async () => {
    const req = makeRequest({ url: 'https://example.com/page' })
    const res = await POST(req)
    const data = await res.json()
    expect(data).toHaveProperty('kind')
    expect(data).toHaveProperty('provider')
    expect(data).toHaveProperty('canonicalUrl')
    expect(data).toHaveProperty('title')
    expect(data).toHaveProperty('renderMode')
    expect(data).toHaveProperty('connectionRequired')
    expect(data).toHaveProperty('rawMetadata')
  })
})
