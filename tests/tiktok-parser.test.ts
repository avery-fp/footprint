import { describe, it, expect } from 'vitest'
import { parseURL } from '@/lib/parser'

describe('parseURL — TikTok shortcode handling (regression: server-error in player iframe)', () => {
  it('emits numeric external_id for canonical /@user/video/{id} URL', async () => {
    const r = await parseURL('https://www.tiktok.com/@charlidamelio/video/7234567890123456789')
    expect(r.type).toBe('tiktok')
    expect(r.external_id).toBe('7234567890123456789')
    expect(r.embed_html).toContain('7234567890123456789')
  })

  it('leaves external_id null for vm.tiktok.com shortcodes', async () => {
    // vm shortcodes are alphanumeric, not numeric — they CANNOT be passed
    // to https://www.tiktok.com/player/v1/{id}, which serves "Server Error".
    // external_id must be null so the API skips render_mode='ghost' and the
    // tile falls through to the working preview-card path.
    const r = await parseURL('https://vm.tiktok.com/ZTRq8XK2j/')
    expect(r.type).toBe('tiktok')
    expect(r.external_id).toBeNull()
    expect(r.embed_html).toBeNull()
  })

  it('leaves external_id null for vm shortcode without trailing slash', async () => {
    const r = await parseURL('https://vm.tiktok.com/ZTRabc123')
    expect(r.type).toBe('tiktok')
    expect(r.external_id).toBeNull()
  })
})
