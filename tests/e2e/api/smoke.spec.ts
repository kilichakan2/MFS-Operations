/**
 * tests/e2e/api/smoke.spec.ts
 *
 * F-INFRA-01 — Playwright API smoke.
 *
 * Proves the `api` project is wired correctly: Playwright runs the
 * request fixture against the dev server auto-booted by the webServer
 * block, which in turn talks to the local Supabase stack started by
 * `npm run db:up`. If this passes, integration tests for any real
 * adapter are runnable end-to-end on the developer's machine.
 *
 * Why /api/auth/team:
 *   - Public path (middleware.ts:29 PUBLIC_PATHS) — no cookie needed.
 *   - GET handler — no body required.
 *   - Talks to Supabase via `supabaseService` — proves DB connection.
 *   - Returns JSON array — easy to assert shape without coupling to
 *     specific seed rows. An empty array is still success.
 *
 * Failure modes and what they tell you:
 *   - status 500 with body containing "ECONNREFUSED" → local Supabase
 *     not running. Run `npm run db:up`.
 *   - status 500 with body containing "permission denied" → service-role
 *     key in .env.test.local is wrong (refresh via `supabase status`).
 *   - request never resolves → dev server didn't boot. Check the
 *     webServer block timeout and that `npm run dev` works manually.
 *
 * Production-safety guard:
 *   The env land-mine for this PR is .env.local pointing at production
 *   Supabase. The webServer block in playwright.config.ts overrides
 *   that with values from .env.test.local. This assertion is the
 *   belt-and-braces check that the override took — if it didn't, this
 *   test fails LOUD before any request is fired.
 *
 * Run: `npm run test:e2e:api`
 */

import { test, expect } from '@playwright/test'

test.describe('F-INFRA-01 — api project smoke', () => {
  test('env points at local Supabase (production-safety guard)', () => {
    expect(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      'NEXT_PUBLIC_SUPABASE_URL must point at localhost — check .env.test.local + playwright.config.ts webServer.env'
    ).toMatch(/localhost|127\.0\.0\.1/)
  })

  test('GET /api/auth/team returns 200 with JSON array', async ({ request }) => {
    const res = await request.get('/api/auth/team')
    expect(res.status(), `body: ${await res.text()}`).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })
})
