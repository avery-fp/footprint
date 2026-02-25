import { test, expect } from '@playwright/test'

test('signup rejects missing fields', async ({ request }) => {
  const res = await request.post('/api/signup', {
    data: { email: 'a@b.com' },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toBeTruthy()
})

test('signup rejects invalid email', async ({ request }) => {
  const res = await request.post('/api/signup', {
    data: { email: 'not-an-email', username: 'testuser', password: 'hunter22' },
  })
  expect(res.status()).toBe(400)
})

test('events rejects invalid event_type', async ({ request }) => {
  const res = await request.post('/api/events', {
    data: { footprint_id: 'fake-id', event_type: 'INVALID' },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('Invalid event_type')
})

test('content reorder rejects non-array updates', async ({ request }) => {
  const res = await request.post('/api/content/reorder', {
    data: { footprint_id: 'fake', updates: 'not-array' },
  })
  expect(res.status()).toBe(400)
})
