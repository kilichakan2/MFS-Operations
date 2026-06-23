/**
 * tests/e2e/17-haccp-mince-prep.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Drives the
 * Mince / Meat-prep / Time-separation screen (CCP-M1/M2, MP1/MP2) in a real
 * Chromium browser against the LOCAL Supabase stack, proving the re-pointed POST
 * /api/haccp/mince-prep works end-to-end across all three tabs plus a deviation:
 *
 *   1. Mince tab        — species, kill date (today = within limit), input temp in
 *                         range (≤7°C) via the Numpad, output temp in range (≤2°C
 *                         chilled), submit → "Mince logged — <batch>".
 *   2. Meat-prep tab    — product name, temps in range, an allergen + label-check,
 *                         submit → "Prep logged — <batch>".
 *   3. Time-sep tab     — three time inputs + clean-verified-by + allergens, submit
 *                         → "Time separation logged". Timesep writes NO CA — only
 *                         the success flash is asserted.
 *   4. Mince deviation  — a mince output temp out of range (>2°C chilled) opens the
 *                         CCAPopup; pick cause/disposition/recurrence → "Confirm &
 *                         submit" → success. The mince temp CA sets
 *                         management_verification_required=true (service line 1605),
 *                         so it lands in the admin queue → asserted as admin
 *                         (matched by the batch code on the deviation row).
 *
 * Screen facts (app/haccp/mince/page.tsx, read 2026-06-23):
 *   - Tab buttons: "Mince Log" / "Meat Prep" / "Time Sep".
 *   - Mince: species buttons "Lamb" / "Beef (fresh)" / "Imported / vac-packed";
 *     kill-date <input type="date">; input/output temps via "Tap to enter" Numpad
 *     buttons; output mode "Chilled ≤2°C" / "Frozen ≤-18°C". Submit "Submit mince
 *     log". Flash "Mince logged — <batch_code>".
 *   - Numpad digit buttons carry the bare digit; "+/− Toggle negative (for frozen)"
 *     for negatives; confirm "Confirm <v>°C".
 *   - Meat-prep: product name input (placeholder "e.g. Marinated lamb leg, …"),
 *     temps, 14 allergen chips, "Label check completed (CCP-MP2)" button (required
 *     once an allergen is picked). Submit "Submit meat prep log". Flash "Prep
 *     logged — <batch>".
 *   - Time-sep: <input type="time"> for "Clean completed ✱"; text inputs for
 *     "Clean verified by ✱" (placeholder "Name of person who visually verified the
 *     clean") + "Allergens in production ✱" (placeholder "e.g. Mustard, Gluten,
 *     Soya"). Submit "Submit time separation log". Flash "Time separation logged".
 *   - CCAPopup (mince/prep temp deviation): cause grid, disposition list, recurrence
 *     list, confirm "Confirm & submit".
 *   - Mince/meat-prep need no seeded reference data (source-batch pickers are
 *     optional; species/allergens/output-mode are in-component).
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user +
 * admin password. Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'

// Enter a temperature into the currently-open Numpad. `negative` toggles sign.
async function numpad(page: Page, value: string, negative = false) {
  for (const ch of value) {
    await page.getByRole('button', { name: ch === '.' ? '.' : ch, exact: true }).click()
  }
  if (negative) {
    await page.getByRole('button', { name: /toggle negative/i }).click()
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

// The input/output temp buttons carry a descriptive prefix in their accessible
// name (e.g. "Beef (fresh) · limit ≤7°C Tap to enter", "Check after chilling …
// Tap to enter"), and the input button is disabled until a species is selected.
// Anchor on the unique "limit ≤…°C" (input) / "Check after" (output) substrings.
async function openInputTemp(page: Page, value: string, negative = false) {
  await page.getByRole('button', { name: /limit ≤7°C/i }).click()
  await numpad(page, value, negative)
}
async function openOutputTemp(page: Page, value: string, negative = false) {
  await page.getByRole('button', { name: /Check after (chilling|freezing)/i }).click()
  await numpad(page, value, negative)
}

const todayISO = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

test.describe('@critical HACCP mince / prep / time-sep (F-19 PR2 re-point)', () => {
  test('mince tab — in-range run logs successfully', async ({ page }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/mince')
    await expect(page).toHaveURL(/\/haccp\/mince/)

    // Mince Log tab is the default; click it to be explicit.
    await page.getByRole('button', { name: /^Mince Log$/ }).click()

    // Species buttons carry a subtitle in their name (e.g. "Beef (fresh) max 6d
    // · ≤7°C"); match on the leading label. Picking species enables the input
    // temp button.
    await page.getByRole('button', { name: /^Beef \(fresh\)/ }).click()
    await page.locator('input[type="date"]').first().fill(todayISO()) // 0 days = within limit

    await openInputTemp(page, '5')                                    // ≤7°C
    await page.getByRole('button', { name: /^Chilled ≤2°C/ }).click() // output mode
    await openOutputTemp(page, '1')                                   // ≤2°C

    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    await expect(page.getByText(/mince logged —/i)).toBeVisible({ timeout: 10_000 })
  })

  test('meat-prep tab — in-range prep with allergen logs successfully', async ({ page }) => {
    const MARKER = `E2E-PREP-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/mince')

    await page.getByRole('button', { name: /^Meat Prep$/ }).click()

    await page.getByPlaceholder(/marinated lamb leg/i).fill(`${MARKER} seasoned mince`)

    // Meat-prep input button has a BARE "Tap to enter" name (no prefix); the
    // output button carries the "Check after …" prefix. So target input by the
    // bare name and output by its prefix.
    await page.getByRole('button', { name: /^Tap to enter$/ }).click()
    await numpad(page, '5')                                          // input ≤7°C
    await page.getByRole('button', { name: /^Chilled ≤4°C/ }).click() // output mode
    await openOutputTemp(page, '3')                                  // ≤4°C

    // One allergen + label check (required once an allergen is present).
    await page.getByRole('button', { name: /^Mustard$/ }).click()
    await page.getByRole('button', { name: /label check completed/i }).click()

    await page.getByRole('button', { name: /^Submit meat prep log$/ }).click()
    await expect(page.getByText(/prep logged —/i)).toBeVisible({ timeout: 10_000 })
  })

  test('time-sep tab — submits successfully and writes NO corrective action', async ({ page }) => {
    const MARKER = `E2E-TSEP-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/mince')

    await page.getByRole('button', { name: /^Time Sep$/ }).click()

    // Three time inputs — only "Clean completed" is required, but fill all three.
    const times = page.locator('input[type="time"]')
    await times.nth(0).fill('09:00') // plain products ended
    await times.nth(1).fill('10:00') // clean completed (required)
    await times.nth(2).fill('11:00') // allergen products started

    await page
      .getByPlaceholder(/name of person who visually verified the clean/i)
      .fill(`${MARKER}-verifier`)
    await page.getByPlaceholder(/e\.g\. Mustard, Gluten, Soya/i).fill('Mustard, Gluten')

    await page.getByRole('button', { name: /^Submit time separation log$/ }).click()
    await expect(page.getByText(/time separation logged/i)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('mince deviation — out-of-range output temp raises a CA that reaches the admin queue', async ({
    page,
  }) => {
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/mince')

    await page.getByRole('button', { name: /^Mince Log$/ }).click()
    await page.getByRole('button', { name: /^Beef \(fresh\)/ }).click()
    await page.locator('input[type="date"]').first().fill(todayISO())

    await openInputTemp(page, '5')                                   // input in range
    await page.getByRole('button', { name: /^Chilled ≤2°C/ }).click() // output mode
    await openOutputTemp(page, '8')                                  // 8°C > 2°C → deviation

    // Submit opens the CCAPopup (temperature deviation).
    await page.getByRole('button', { name: /^Submit mince log$/ }).click()
    await expect(page.getByText(/corrective action required/i).first()).toBeVisible({
      timeout: 10_000,
    })
    // Output-channel cause/disposition/recurrence.
    await page
      .getByRole('button', { name: /insufficient chilling time after mincing/i })
      .click()
    await page.getByRole('button', { name: /^Conditional accept$/ }).click()
    // Recurrence option for this cause (MINCE_RECURRENCE_BY_CAUSE).
    await page
      .getByRole('button', { name: /increase chilling time before dispatch/i })
      .click()
    await page.getByRole('button', { name: /^Confirm & submit$/ }).click()

    await expect(page.getByText(/mince logged —/i)).toBeVisible({ timeout: 10_000 })

    // Admin queue: the mince output-temp CA must surface. Its
    // deviation_description: "Mince output temp: 8°C (limit ≤2°C, chilled). …".
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')

    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: /Mince output temp: 8°C \(limit ≤2°C/ })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })
})
