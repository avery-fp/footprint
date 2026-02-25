import { test, expect } from '@playwright/test'

test('unknown slug returns 404', async ({ page }) => {
  const res = await page.goto('/this-slug-definitely-does-not-exist-9999')
  expect(res?.status()).toBe(404)
})
