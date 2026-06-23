/**
 * tests/e2e/18-haccp-allergens.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR3 (Cluster-B HACCP route re-point). Drives the Allergen
 * Assessment screen in a real Chromium browser against the LOCAL Supabase stack,
 * proving the re-pointed routes work end-to-end. This page hosts BOTH Cluster-B
 * allergen routes:
 *   - the assessment form        → POST /api/haccp/allergen-assessment
 *   - the monthly-review "Run"    → POST /api/haccp/allergen-assessment/monthly-reviews
 *
 * Flows:
 *   1. Update the site allergen assessment (admin) → "Assessment updated".
 *   2. Run a monthly review for a far-past month (owns no deliveries) → the
 *      "No deliveries found" complete banner, then re-run the SAME month
 *      (the UPSERT-overwrite path — still succeeds, does not error/duplicate).
 *
 * Screen facts (app/haccp/allergens/page.tsx):
 *   - Heading "Site Allergen Assessment".
 *   - Admin "Update" opens the form; "Site allergen status" buttons
 *     ("Nil allergens on site" …); "Next review date" date input; "Cross-
 *     contamination risk statement" textarea; submit "Save assessment".
 *     Success banner: "Assessment updated".
 *   - "Run monthly review" section: "Month" (input type=month) + "Run review — {month}".
 *     Success banner: "Review complete" / "No deliveries found for {month}".
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with admin PIN/user.
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

test.describe('@critical HACCP allergens (F-19 PR3 re-point)', () => {
  test('admin updates the allergen assessment', async ({ page }) => {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)

    // The Update button only renders once an assessment already exists
    // (app/haccp/allergens/page.tsx:292) and the page offers no in-UI
    // create-first path. Seed one through the SAME API the page's Save
    // uses (POST /api/haccp/allergen-assessment) — the request carries the
    // logged-in admin's mfs_role + mfs_user_id cookies, so it exercises the
    // real admin-gated insert path, not a backdoor.
    const seed = await page.request.post('/api/haccp/allergen-assessment', {
      data: {
        site_status: 'nil_allergens',
        next_review_date: '2030-01-01',
        cross_contam_risk: `E2E-ALG-SEED-${Date.now()} baseline assessment`,
        procedure_notes: null,
        raw_materials: [],
      },
    })
    expect(seed.status()).toBe(201)

    await page.goto('/haccp/allergens')
    await expect(
      page.getByRole('heading', { name: /site allergen assessment/i }),
    ).toBeVisible()

    await page.getByRole('button', { name: /^Update$/ }).click()

    // Required: site status + next review date + cross-contam statement.
    await page.getByRole('button', { name: /nil allergens on site/i }).click()
    await page.locator('input[type="date"]').first().fill('2030-01-01')
    await page
      .getByPlaceholder(/describe controls in place to prevent allergens/i)
      .fill(`E2E-ALG-${Date.now()} controls in place`)

    await page.getByRole('button', { name: /save assessment/i }).click()
    await expect(page.getByText(/assessment updated/i)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('admin runs a monthly review and re-runs the same month (upsert overwrite)', async ({
    page,
  }) => {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
    await page.goto('/haccp/allergens')

    // A far-past month owns no real deliveries → "No deliveries found".
    const month = '1990-01'
    const monthInput = page.locator('input[type="month"]')
    await monthInput.fill(month)
    await page.getByRole('button', { name: /run review/i }).click()
    await expect(page.getByText(/review complete|no deliveries found/i)).toBeVisible({
      timeout: 10_000,
    })

    // Re-run the SAME month → still succeeds (the UPSERT-overwrite path).
    await monthInput.fill(month)
    await page.getByRole('button', { name: /run review/i }).click()
    await expect(page.getByText(/review complete|no deliveries found/i)).toBeVisible({
      timeout: 10_000,
    })
  })
})
