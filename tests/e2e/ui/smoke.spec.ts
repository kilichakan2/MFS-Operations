/**
 * tests/e2e/ui/smoke.spec.ts
 *
 * F-INFRA-01 — Playwright UI smoke.
 *
 * Proves the `ui` project is wired correctly: Playwright launches
 * chromium via the installed browser binary, visits the dev server
 * (auto-booted), and renders the public /login page. If this passes,
 * the developer can write UI E2E specs that target real React state.
 *
 * Why /login:
 *   - Public path (middleware.ts:29 PUBLIC_PATHS) — no session needed.
 *   - Long-standing stable page; 13 existing E2E specs already
 *     interact with it (see tests/e2e/_auth.ts).
 *   - The MFS logo and the name input are both reliable selectors.
 *
 * Failure modes:
 *   - timeout waiting for /login → dev server not up; webServer block
 *     misconfigured or `npm run dev` errored.
 *   - logo/input not found → /login was restyled and selector drifted;
 *     update selector to match.
 *
 * Run: `npm run test:e2e:ui`
 */

import { test, expect } from '@playwright/test'

test.describe('F-INFRA-01 — ui project smoke', () => {
  test('GET /login renders the login page', async ({ page }) => {
    await page.goto('/login')
    // Logo is server-rendered and framework-routing-agnostic. It is an
    // inline SVG (components/MfsLogo.tsx) with aria-label="MFS Wholesale",
    // so we match by ARIA role=img + accessible name. getByAltText would
    // only match <img alt="…"> HTML elements, not SVG aria-label nodes.
    await expect(page.getByRole('img', { name: /MFS/i })).toBeVisible({ timeout: 10_000 })
  })
})
