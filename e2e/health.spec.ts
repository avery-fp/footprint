import { test, expect } from '@playwright/test'

test('health endpoint returns ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.status).toBe('ok')
})

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/footprint/i)
})
