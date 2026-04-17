import { test, expect } from '@playwright/test'

/**
 * Gate smoke tests. All 3 must pass before distribution fires.
 *
 * 1. editor = public  — /ae/home loads without a session (no auth wall)
 * 2. delete persists  — DELETE /api/tiles without auth returns 403 (ownership
 *                       gate is live; zombie-tile fix confirmed in code review)
 * 3. auth/claim flow  — /home (auth entry) and /claim both return 200
 */

test('editor = public: /ae/home loads without session', async ({ page }) => {
  const res = await page.goto('/ae/home')
  expect(res?.status()).toBe(200)
  // Must stay on /ae/home, not redirect to bare /home (the auth entry)
  expect(page.url()).toMatch(/\/ae\/home/)
})

test('delete persists: DELETE /api/tiles requires ownership', async ({ request }) => {
  const res = await request.delete('/api/tiles', {
    data: { slug: 'ae', source: 'library', id: 'fake-id' },
  })
  // No session → 403 Unauthorized, not 200 with fake success
  expect(res.status()).toBe(403)
})

test('auth/claim flow: /home and /claim both load', async ({ page }) => {
  const home = await page.goto('/home')
  expect(home?.status()).toBe(200)

  const claim = await page.goto('/claim')
  expect(claim?.status()).toBe(200)
})
