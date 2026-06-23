/**
 * tests/e2e/15-haccp-cleaning.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Drives the Cleaning
 * diary (SOP 2) in a real Chromium browser against the LOCAL Supabase stack,
 * proving the re-pointed POST /api/haccp/cleaning works end-to-end:
 *
 *   1. Happy path     — select cleaned items, verified-by (Other free-text),
 *                       issues = No, submit → "Clean logged — ready for next entry"
 *                       + the row in today's log.
 *   2. Deviation path — issues = Yes opens the CCAPopup; pick cause/disposition/
 *                       recurrence → "Confirm & submit" → success. The cleaning CA
 *                       is management_verification_required=FALSE (service line
 *                       1309), so it deliberately does NOT reach the admin queue —
 *                       this spec asserts the success flash + the "Issue noted"
 *                       badge on the on-screen log, NOT the admin queue. (Asserting
 *                       it in the queue would be wrong: cleaning issues are logged
 *                       but not management-verified.)
 *
 * Screen facts (app/haccp/cleaning/page.tsx, read 2026-06-23):
 *   - Cleaned-item chips by label (e.g. "Knives", "Work surfaces / prep tables")
 *     + an "Other" chip → free input "Describe what else was cleaned…".
 *   - Verified-by presets ("Daryl/Hakan/Ege") + "Other" → input "Enter name…".
 *   - Issues toggle: "Yes" / "No". A "Knife steriliser (82°C)" selection adds a
 *     °C number field; <82 auto-flags a deviation (not exercised here — we drive
 *     the explicit Yes path).
 *   - Submit: "Submit clean". Success flash: "Clean logged — ready for next entry".
 *   - CCAPopup: cause grid, disposition list, recurrence list, confirm
 *     "Confirm & submit".
 *   - Log row: shows what_was_cleaned + a status badge "No issues" / "Issue noted".
 *
 * The MARKER rides in the "Other" cleaned-item free text so it appears verbatim in
 * the what_was_cleaned text on the on-screen log row.
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user.
 * Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './_auth'

async function pickVerifier(page: Page, name: string) {
  // The verified-by "Other" is the LAST "Other" button on the page (the cleaned-
  // items grid has its own "Other" chip first).
  await page.getByRole('button', { name: /^Other\b/ }).last().click()
  await page.getByPlaceholder(/enter name/i).fill(name)
}

test.describe('@critical HACCP cleaning (F-19 PR2 re-point)', () => {
  test('happy path — clean with no issues logs successfully', async ({ page }) => {
    const MARKER = `E2E-CLN-OK-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cleaning')
    await expect(page).toHaveURL(/\/haccp\/cleaning/)

    // Multi-select cleaned items. Each chip's accessible name includes its
    // subtitle (e.g. "Knives After each use …"), so match on the leading label.
    await page.getByRole('button', { name: /^Knives\b/ }).click()
    await page.getByRole('button', { name: /^Cutting boards\b/ }).click()
    // "Other" chip → free text carries the MARKER (shows in the log).
    await page.getByRole('button', { name: /^Other\b/ }).first().click()
    await page.getByPlaceholder(/describe what else was cleaned/i).fill(`${MARKER} bench`)

    await pickVerifier(page, `${MARKER}-verifier`)

    // No issues.
    await page.getByRole('button', { name: 'No', exact: true }).click()

    await page.getByRole('button', { name: /submit clean/i }).click()
    await expect(
      page.getByText(/clean logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })

    // The MARKER (in what_was_cleaned) appears on the on-screen log.
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('deviation path — issues=yes raises a CA and shows on the log (not the admin queue)', async ({
    page,
  }) => {
    const MARKER = `E2E-CLN-DEV-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/cleaning')

    await page.getByRole('button', { name: /^Knives\b/ }).click()
    await page.getByRole('button', { name: /^Other\b/ }).first().click()
    await page.getByPlaceholder(/describe what else was cleaned/i).fill(`${MARKER} drain`)
    await pickVerifier(page, `${MARKER}-verifier`)

    // Issues = Yes → CCAPopup.
    await page.getByRole('button', { name: 'Yes', exact: true }).click()

    await page.getByRole('button', { name: /submit clean/i }).click()
    await expect(page.getByText(/corrective action required/i).first()).toBeVisible({
      timeout: 10_000,
    })
    await page
      .getByRole('button', { name: /visible residue remaining after clean/i })
      .click()
    await page.getByRole('button', { name: /re-cleaned and verified/i }).click()
    await page
      .getByRole('button', { name: /retrain on 4-step cleaning process/i })
      .click()
    await page.getByRole('button', { name: /^Confirm & submit$/ }).click()

    await expect(
      page.getByText(/clean logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })

    // The log row carries the MARKER and an "Issue noted" badge — the deviation is
    // recorded on the screen. Cleaning CAs are NOT management-verified, so they do
    // not appear in /haccp/admin by design.
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(/issue noted/i).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
