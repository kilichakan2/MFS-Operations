/**
 * tests/e2e/19-haccp-food-defence.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR3 (Cluster-B HACCP route re-point). Drives the Food
 * Defence Plan screen in a real Chromium browser against the LOCAL Supabase
 * stack, proving the re-pointed POST /api/haccp/food-defence works end-to-end.
 *
 * Flow: admin creates a new plan VERSION (append-only) with the three required
 * fields (version / issue date / next review) → the version appears in the list.
 *
 * Screen facts (app/haccp/food-defence/page.tsx):
 *   - Heading "Food Defence Plan".
 *   - Admin "+ New version" opens the form.
 *   - Required: "Version *" (placeholder "V1.1"), "Issue date *" + "Next review *"
 *     (date inputs). Submit "Save new version" (disabled until all 3 filled).
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with admin PIN/user.
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

test.describe('@critical HACCP food-defence (F-19 PR3 re-point)', () => {
  test('admin creates a new food-defence plan version (append-only)', async ({ page }) => {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
    await page.goto('/haccp/food-defence')
    await expect(
      page.getByRole('heading', { name: /food defence plan/i }),
    ).toBeVisible()

    await page.getByRole('button', { name: /\+ New version/i }).click()

    const version = `E2E-FD-${Date.now()}`
    await page.getByPlaceholder('V1.1').fill(version)
    const dates = page.locator('input[type="date"]')
    await dates.nth(0).fill('2026-01-01') // issue date
    await dates.nth(1).fill('2099-01-01') // next review (future → review_due false)

    await page.getByRole('button', { name: /save new version/i }).click()

    // The new version lands in the list/detail.
    await expect(page.getByText(new RegExp(version)).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
