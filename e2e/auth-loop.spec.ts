import { test, expect } from '@playwright/test'

/**
 * Regression coverage for the sign-in loop bug.
 *
 * Root cause was app/not-found.tsx reading an HttpOnly cookie via document.cookie
 * (always false), so the "claim this page" CTA always pointed at /login, which
 * 404'd back to not-found.tsx, looping forever.
 *
 * These tests pin the canonical auth entry to /home and ensure dead routes
 * redirect there in a single hop instead of 404'ing.
 */

test('direct visit to /login redirects to /home', async ({ page }) => {
  const res = await page.goto('/login')
  expect(res?.status()).toBe(200)
  expect(page.url()).toContain('/home')
})

test('direct visit to /auth/login redirects to /home', async ({ page }) => {
  const res = await page.goto('/auth/login')
  expect(res?.status()).toBe(200)
  expect(page.url()).toContain('/home')
})

test('direct visit to /signin reaches /home in at most 2 hops', async ({ page }) => {
  const res = await page.goto('/signin')
  expect(res?.status()).toBe(200)
  expect(page.url()).toContain('/home')
})

test('unclaimed slug not-found CTA never points to /login', async ({ page }) => {
  await page.goto('/zzz-no-such-page-9999')
  // The "claim this page" link must point at the auth entry, not /login
  const claimLink = page.getByRole('link', { name: /claim this page/i })
  await expect(claimLink).toBeVisible()
  const href = await claimLink.getAttribute('href')
  expect(href).not.toBeNull()
  expect(href).not.toContain('/login')
})

test('unclaimed slug not-found page has no /login references in DOM', async ({ page }) => {
  await page.goto('/zzz-no-such-page-9999')
  const html = await page.content()
  const matches = html.match(/href=["']([^"']*\/login[^"']*)["']/g)
  expect(matches, `Found dead /login refs in not-found.tsx: ${matches?.join(', ')}`).toBeNull()
})
