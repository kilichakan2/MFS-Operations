/**
 * tests/e2e/redirects.spec.ts
 *
 * Backward-compat sanity for the Item 4 URL rename. Asserts that the
 * five legacy /screenN paths plus the /screen5/:path* wildcard fire
 * the Next.js redirects() configured in next.config.ts.
 *
 * Each test issues an unauthenticated GET that does NOT follow
 * redirects, then asserts:
 *   • status === 307  (Next.js standard for permanent:false)
 *   • Location header matches the renamed semantic URL
 *
 * No login required — redirects() fires at the Next.js routing
 * layer before middleware auth runs. The /screen5/:path* wildcard
 * scenarios assert the RULE FIRES (correct Location header), not
 * that the destination resolves (the destination paths are
 * intentionally absent from disk today; the wildcard is forward-
 * compat for a future /admin sub-route expansion).
 */

import { test, expect } from '@playwright/test'

test.describe('Legacy /screenN → semantic URL redirects', () => {
  test('GET /screen1 → 307 with Location: /dispatch', async ({ request }) => {
    const res = await request.get('/screen1', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/dispatch$/)
  })

  test('GET /screen4 → 307 with Location: /dashboard/admin', async ({ request }) => {
    const res = await request.get('/screen4', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/dashboard\/admin$/)
  })

  test('GET /screen5 → 307 with Location: /admin', async ({ request }) => {
    const res = await request.get('/screen5', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/admin$/)
  })

  test('GET /screen5/users → 307 with Location: /admin/users (rule fires; destination not on disk)', async ({ request }) => {
    const res = await request.get('/screen5/users', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/admin\/users$/)
  })

  test('GET /screen5/customers → 307 with Location: /admin/customers (rule fires; destination not on disk)', async ({ request }) => {
    const res = await request.get('/screen5/customers', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/admin\/customers$/)
  })

  test('GET /screen6 → 307 with Location: /map', async ({ request }) => {
    const res = await request.get('/screen6', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/map$/)
  })
})
