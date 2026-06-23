/**
 * tests/e2e/14-haccp-calibration.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Drives Thermometer
 * Calibration (SOP 3) in a real Chromium browser against the LOCAL Supabase stack,
 * proving the re-pointed POST /api/haccp/calibration works end-to-end across all
 * three branches:
 *
 *   1. Manual PASS    — probe id (Other free-text), ice-water reading in band
 *                       (-1..1), boiling reading in band (99..101), verified-by
 *                       (Other free-text), submit → "Calibration record saved".
 *   2. Manual FAIL    — a reading out of band opens the CCAPopup; pick cause/
 *                       disposition/recurrence → "Confirm & submit" → success. The
 *                       failure CA sets management_verification_required=true
 *                       (service line 1256), so it lands in the admin queue →
 *                       asserted as admin (matched by the unique probe id, which
 *                       the deviation_description embeds).
 *   3. Certified probe— switch mode, cert ref + purchase date + notes + verified-by,
 *                       submit → "Calibration record saved".
 *
 * Screen facts (app/haccp/calibration/page.tsx, read 2026-06-23):
 *   - Mode buttons: "Manual calibration" / "Certified probe in use".
 *   - Probe id presets ("Probe 1/2", "Backup Probe") + an "Other" button → free
 *     input placeholder "e.g. Probe 3, Lab Probe".
 *   - Ice + boiling readings: two "Tap to enter" buttons (ice first, boiling
 *     second) each opening the Numpad. Digit buttons carry the bare digit; the ice
 *     Numpad has a "+/− Toggle negative" key. Confirm button: "Confirm <v>°C".
 *   - Verified-by presets ("Daryl/Hakan/Ege") + "Other" → input "Enter name…".
 *   - Submit: "Submit calibration" (manual) / "Log certified probe" (certified).
 *     Success flash: "Calibration record saved".
 *   - CCAPopup (manual fail): cause grid, disposition list, recurrence list,
 *     confirm "Confirm & submit".
 *   - Certified mode: "Certificate reference" input, "Probe purchase date" date
 *     input, optional notes, verified-by.
 *   - No seeded data needed — every field has presets or free-text fallback.
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user +
 * admin password. Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'

// Open a reading button by its unique descriptive text ('ice' or 'boil'), enter
// the value on the Numpad, confirm. Anchoring on the unique button text (rather
// than an index) survives the first reading being filled (which removes its "Tap
// to enter" text and would shift any nth() index). `negative` toggles the ice
// Numpad's +/- key.
async function enterReading(page: Page, which: 'ice' | 'boil', value: string, negative = false) {
  const anchor = which === 'ice'
    ? /Fill container with crushed ice/i
    : /Insert probe 2 inches into rolling boil/i
  await page.getByRole('button', { name: anchor }).click()
  for (const ch of value) {
    await page.getByRole('button', { name: ch === '.' ? '.' : ch, exact: true }).click()
  }
  if (negative) {
    await page.getByRole('button', { name: /toggle negative/i }).click()
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

async function pickProbe(page: Page, id: string) {
  // Probe "Other" is the FIRST "Other" (verified-by has its own "Other" later).
  await page.getByRole('button', { name: /^Other$/ }).first().click()
  // The probe free-text placeholder differs by mode: manual "e.g. Probe 3, Lab
  // Probe" vs certified "e.g. New Probe Apr 2026" — both start "e.g." + "Probe".
  await page.getByPlaceholder(/e\.g\..*Probe/i).fill(id)
}

async function pickVerifier(page: Page, name: string) {
  await page.getByRole('button', { name: /^Other$/ }).last().click()
  await page.getByPlaceholder(/enter name/i).fill(name)
}

test.describe('@critical HACCP calibration (F-19 PR2 re-point)', () => {
  test('manual mode pass — in-band readings save successfully', async ({ page }) => {
    const PROBE = `E2E-CAL-OK-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/calibration')
    await expect(page).toHaveURL(/\/haccp\/calibration/)

    await page.getByRole('button', { name: /manual calibration/i }).click()
    await pickProbe(page, PROBE)
    await enterReading(page, 'ice', '0')      // ice 0°C (in band -1..1)
    await enterReading(page, 'boil', '100')   // boiling 100°C (in band 99..101)
    await pickVerifier(page, `${PROBE}-verifier`)

    await page.getByRole('button', { name: /^Submit calibration$/ }).click()
    await expect(page.getByText(/calibration record saved/i)).toBeVisible({
      timeout: 10_000,
    })
  })

  test('manual mode fail — out-of-band reading raises a CA that reaches the admin queue', async ({
    page,
  }) => {
    const PROBE = `E2E-CAL-FAIL-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/calibration')

    await page.getByRole('button', { name: /manual calibration/i }).click()
    await pickProbe(page, PROBE)
    await enterReading(page, 'ice', '0')      // ice in band
    await enterReading(page, 'boil', '95')    // boiling 95°C — OUT of band (99..101) → fail
    await pickVerifier(page, `${PROBE}-verifier`)

    // Submitting with a failure opens the CCAPopup.
    await page.getByRole('button', { name: /^Submit calibration$/ }).click()
    await expect(page.getByText(/corrective action required/i).first()).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: /probe drift — normal wear over time/i }).click()
    await page.getByRole('button', { name: /probe removed from service/i }).click()
    await page.getByRole('button', { name: /replace probe on regular schedule/i }).click()
    await page.getByRole('button', { name: /^Confirm & submit$/ }).click()

    await expect(page.getByText(/calibration record saved/i)).toBeVisible({
      timeout: 10_000,
    })

    // Admin queue: the calibration failure CA must surface. The
    // deviation_description embeds the probe id: "Probe calibration failure
    // (<PROBE>): Boiling water: 95°C …".
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')

    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: PROBE })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })

  test('certified probe mode — cert details save successfully', async ({ page }) => {
    const CERT = `E2E-CAL-CERT-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/calibration')

    await page.getByRole('button', { name: /certified probe in use/i }).click()
    await pickProbe(page, `${CERT}-probe`)
    await page
      .getByPlaceholder(/UKAS/i)
      .fill(`${CERT}-ref`)
    // Purchase date — a date input; set to today (max is today).
    const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
    await page.locator('input[type="date"]').fill(today)
    await page.getByPlaceholder(/any additional notes/i).fill(`${CERT} note`)
    await pickVerifier(page, `${CERT}-verifier`)

    await page.getByRole('button', { name: /^Log certified probe$/ }).click()
    await expect(page.getByText(/calibration record saved/i)).toBeVisible({
      timeout: 10_000,
    })
  })
})
