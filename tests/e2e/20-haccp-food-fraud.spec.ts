/**
 * tests/e2e/20-haccp-food-fraud.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR3 (Cluster-B HACCP route re-point). Drives the Food
 * Fraud Assessment screen in a real Chromium browser against the LOCAL Supabase
 * stack, proving the re-pointed POST /api/haccp/food-fraud works end-to-end.
 *
 * Flow: admin creates a new assessment VERSION (append-only) with the three
 * required fields + the default risk row (risks is a required array) → the
 * version appears in the list.
 *
 * Screen facts (app/haccp/food-fraud/page.tsx):
 *   - Heading "Food Fraud Assessment".
 *   - Admin "+ New version" opens the form.
 *   - Required: "Version *" (placeholder "V1.1"), "Issue date *" + "Next review *"
 *     (date inputs). A default risk row exists ("Fraud type" placeholder
 *     "e.g. Species substitution"). Submit "Save new version".
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with admin PIN/user.
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

test.describe('@critical HACCP food-fraud (F-19 PR3 re-point)', () => {
  test('admin creates a new food-fraud assessment version (append-only)', async ({ page }) => {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
    await page.goto('/haccp/food-fraud')
    await expect(
      page.getByRole('heading', { name: /food fraud assessment/i }),
    ).toBeVisible()

    await page.getByRole('button', { name: /\+ New version/i }).click()

    const version = `E2E-FF-${Date.now()}`
    await page.getByPlaceholder('V1.1').fill(version)
    const dates = page.locator('input[type="date"]')
    await dates.nth(0).fill('2026-01-01') // issue date
    await dates.nth(1).fill('2099-01-01') // next review

    // The default risk row gives a non-empty risks array.
    await page
      .getByPlaceholder(/e\.g\. Species substitution/i)
      .fill(`${version} risk`)

    await page.getByRole('button', { name: /save new version/i }).click()

    await expect(page.getByText(new RegExp(version)).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
