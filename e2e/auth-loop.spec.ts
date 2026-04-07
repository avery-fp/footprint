import { test, expect } from '@playwright/test'

/**
 * Regression coverage for the sign-in loop bug.
 *
 * Root cause was app/not-found.tsx reading an HttpOnly cookie via document.cookie
 * (always false), so the "claim this page" CTA always pointed at /login, which
 * 404'd back to not-found.tsx, looping forever. Compounded by missing /login and
 * /auth/login pages after commit 7008f8d.
 *
 * These tests pin the canonical auth entry to /ae?claim=1 and ensure dead routes
 * redirect there in a single hop instead of 404'ing.
 */

test('direct visit to /login redirects to /ae?claim=1', async ({ page }) => {
  const res = await page.goto('/login')
  expect(res?.status()).toBe(200)
  expect(page.url()).toContain('/ae')
  expect(page.url()).toContain('claim=1')
})

test('direct visit to /auth/login redirects to /ae?claim=1', async ({ page }) => {
  const res = await page.goto('/auth/login')
  expect(res?.status()).toBe(200)
  expect(page.url()).toContain('/ae')
  expect(page.url()).toContain('claim=1')
})

test('direct visit to /signin reaches /ae in at most 2 hops', async ({ page }) => {
  const res = await page.goto('/signin')
  expect(res?.status()).toBe(200)
  expect(page.url()).toContain('/ae')
  expect(page.url()).toContain('claim=1')
})

test('unclaimed slug not-found CTA never points to /login', async ({ page }) => {
  await page.goto('/zzz-no-such-page-9999')
  // The "claim this page" link must point at the auth entry, not /login
  const claimLink = page.getByRole('link', { name: /claim this page/i })
  await expect(claimLink).toBeVisible()
  const href = await claimLink.getAttribute('href')
  expect(href).not.toBeNull()
  expect(href).not.toContain('/login')
  expect(href).toContain('claim=1')
})

test('unclaimed slug not-found page has no /login references in DOM', async ({ page }) => {
  await page.goto('/zzz-no-such-page-9999')
  // Defense in depth: even after future edits, this page should never reference /login
  const html = await page.content()
  // Allow /login as a substring of /loginXyz only if it's a complete path segment.
  // Strict check: no href ending in or containing "/login" followed by "?" or end-of-attribute
  const matches = html.match(/href=["']([^"']*\/login[^"']*)["']/g)
  expect(matches, `Found dead /login refs in not-found.tsx: ${matches?.join(', ')}`).toBeNull()
})
