/**
 * tests/e2e/12-haccp-delivery.spec.ts
 *
 * @critical
 *
 * NET-NEW E2E for F-19 PR2 (Cluster-A HACCP route re-point). Drives the Delivery
 * Intake screen (CCP 1) in a real Chromium browser against the LOCAL Supabase
 * stack, proving the re-pointed POST /api/haccp/delivery works end-to-end through
 * every branch the UI exposes:
 *
 *   1. Happy path     — category + supplier (Other free-text) + product + in-range
 *                       temp via the Numpad + contamination "no" + allergens "no"
 *                       → "Delivery logged" flash + the row in today's log.
 *   2. Deviation path — an OUT-OF-RANGE (reject, >8°C) temperature opens the
 *                       CCAPopup; pick cause/disposition/recurrence/notes →
 *                       "Confirm & submit delivery" → success. A FAIL temp sets
 *                       management_verification_required=true (service line 989),
 *                       so the CA lands in the admin queue → asserted as admin.
 *   3. W2 pin         — allergen flagged + temp in-range + contamination "no" on a
 *                       NON-CA-allergen category (Dairy / Chilled). The service
 *                       only files an allergen CA for ALLERGEN_CA_CATEGORIES
 *                       (lamb/beef/red_meat/offal/frozen_beef_lamb/poultry — NOT
 *                       dairy/chilled), and only inside a temp/contam deviation
 *                       gate. So this submits with NO CCAPopup and files ZERO CA
 *                       rows → asserted: the admin queue does NOT gain a CA for
 *                       this run's MARKER.
 *
 * Screen facts (app/haccp/delivery/page.tsx, read 2026-06-23):
 *   - Category buttons carry the label text (e.g. "Lamb", "Dairy / Chilled").
 *   - Supplier: seeded suppliers as chips + an "Other" button → free-text input
 *     placeholder "Enter supplier name…". Local seed has ZERO suppliers, so every
 *     flow uses the Other free-text path (confirmed by the mapper).
 *   - Product description placeholder: "e.g. Whole lamb carcasses — 24 units".
 *   - Temperature: a "Tap to enter" button opens the Numpad (fixed overlay). Digit
 *     buttons have the bare digit as their accessible name ("5"), and a "Confirm
 *     <v>°C" button closes it. value==='0' is replaced on next digit.
 *   - Contamination: "No — all clear" / "Yes — rejected" / "Yes — actioned".
 *   - Allergen: "✓ No allergens" / "⚠️ Allergens found" toggle; when found, the 14
 *     allergen chips appear and ≥1 must be picked.
 *   - Submit: "Submit delivery" (becomes "Submit — corrective action required"
 *     when a CCA is needed). Success flash: "Delivery logged — ready for next entry".
 *   - Today's log: each delivery is a card whose body embeds the product text, so
 *     the MARKER (in the product description) locates this run's row.
 *
 * Dairy / Chilled is NOT a meat category, so the BLS traceability fields
 * (born/reared/slaughter/cut) are not required — keeping the W2 + happy paths
 * minimal. Pass limit for dairy is ≤8°C; >8°C = reject (fail).
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with warehouse PIN/user +
 * admin password. Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAs, loginAsAdmin, logout } from './_auth'

// Numpad helper — taps each character of a temperature string, then confirms.
// Negative handling: the Numpad only shows a +/- toggle for the 'frozen'
// category, so we keep deviation temps positive (dairy uses positive limits).
async function enterTemp(page: import('@playwright/test').Page, temp: string) {
  await page.getByRole('button', { name: /tap to enter/i }).click()
  for (const ch of temp) {
    if (ch === '.') {
      await page.getByRole('button', { name: '.', exact: true }).click()
    } else {
      await page.getByRole('button', { name: ch, exact: true }).click()
    }
  }
  await page.getByRole('button', { name: /^Confirm .+°C$/ }).click()
}

test.describe('@critical HACCP delivery intake (F-19 PR2 re-point)', () => {
  test('happy path — in-range dairy delivery logs successfully', async ({ page }) => {
    const MARKER = `E2E-DEL-OK-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/delivery')
    await expect(page).toHaveURL(/\/haccp\/delivery/)

    // Dairy / Chilled — non-meat, no BLS fields, pass limit ≤8°C.
    await page.getByRole('button', { name: 'Dairy / Chilled', exact: true }).click()

    // Supplier via Other free-text (local seed has no suppliers).
    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)

    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} cheese pallet`)

    // In-range temperature (5°C ≤ 8°C → pass).
    await enterTemp(page, '5')

    // Contamination + allergens both clear.
    await page.getByRole('button', { name: /^No — all clear$/ }).click()
    await page.getByRole('button', { name: /no allergens/i }).click()

    await page.getByRole('button', { name: /^Submit delivery$/ }).click()

    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })

    // The just-logged delivery appears in today's log with its product marker.
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('deviation path — reject temperature raises a CA that reaches the admin queue', async ({
    page,
  }) => {
    const MARKER = `E2E-DEL-DEV-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/delivery')

    await page.getByRole('button', { name: 'Dairy / Chilled', exact: true }).click()
    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)
    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} warm dairy`)

    // 12°C > 8°C → reject (fail). fail ⇒ management_verification_required:true.
    await enterTemp(page, '12')
    await page.getByRole('button', { name: /^No — all clear$/ }).click()
    await page.getByRole('button', { name: /no allergens/i }).click()

    // Submit button now reads "Submit — corrective action required"; clicking it
    // opens the CCAPopup (needsCCA gate).
    await page.getByRole('button', { name: /corrective action required/i }).click()

    // CCAPopup — temperature track. Pick cause → disposition (Reject is locked on
    // fail) → recurrence. Then "Confirm & submit delivery".
    await expect(page.getByText(/record what happened/i)).toBeVisible({
      timeout: 10_000,
    })
    await page
      .getByRole('button', { name: /cold chain break in transport/i })
      .click()
    // Recurrence options appear once a cause is chosen.
    await page
      .getByRole('button', { name: /contact supplier — cold chain audit/i })
      .click()
    await page.getByRole('button', { name: /confirm & submit delivery/i }).click()

    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
      timeout: 10_000,
    })

    // Admin opens the corrective-action queue — the fail CA must surface. The
    // delivery TEMPERATURE CA's deviation_description is
    // "Temperature: 12°C (fail) on dairy. Cause: …" (it does NOT embed the product
    // MARKER — only product-return CAs do), so match on that deviation text.
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')

    const card = page
      .locator('div.bg-white.rounded-xl')
      .filter({ hasText: /Temperature: 12°C \(fail\) on dairy/ })
    await expect(async () => {
      await page.reload()
      await expect(card.first()).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  })

  test('W2 pin — allergen-only delivery on a non-CA category files ZERO corrective actions', async ({
    page,
  }) => {
    const MARKER = `E2E-DEL-W2-${Date.now()}`
    await loginAs(page, 'warehouse')
    await page.goto('/haccp/delivery')

    // Dairy / Chilled is NOT in ALLERGEN_CA_CATEGORIES, so an allergen flag here
    // does NOT raise a CA (and never opens the CCAPopup).
    await page.getByRole('button', { name: 'Dairy / Chilled', exact: true }).click()
    await page.getByRole('button', { name: /^Other$/ }).click()
    await page.getByPlaceholder(/enter supplier name/i).fill(`${MARKER}-supplier`)
    await page.getByPlaceholder(/whole lamb carcasses/i).fill(`${MARKER} allergen tray`)

    // In-range temp (3°C ≤ 8°C → pass), contamination clear.
    await enterTemp(page, '3')
    await page.getByRole('button', { name: /^No — all clear$/ }).click()

    // Allergens FOUND — pick one chip.
    await page.getByRole('button', { name: /allergens found/i }).click()
    await page.getByRole('button', { name: /^Milk\/Dairy$/ }).click()

    // No CCAPopup must appear — submit goes straight through (plain "Submit
    // delivery", not the "corrective action required" variant).
    const submit = page.getByRole('button', { name: /^Submit delivery$/ })
    await expect(submit).toBeVisible()
    await submit.click()

    // No CCAPopup header should ever render.
    await expect(page.getByText(/record what happened/i)).toHaveCount(0)

    await expect(
      page.getByText(/delivery logged — ready for next entry/i),
    ).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(new RegExp(MARKER)).first()).toBeVisible({
      timeout: 10_000,
    })

    // The pin: the admin queue must NOT gain a CA for this MARKER. The deviation
    // description embeds the customer/product on real CAs — so if a CA had been
    // filed it would carry the MARKER. Assert it stays absent through several
    // reloads (give any async write time to NOT appear).
    await logout(page)
    await loginAsAdmin(
      page,
      process.env.E2E_USER_ADMIN ?? '',
      process.env.E2E_PASSWORD_ADMIN ?? '',
    )
    await page.goto('/haccp/admin')
    await expect(page.getByText(/corrective action/i).first()).toBeVisible({
      timeout: 10_000,
    })
    // Poll a few times; the MARKER must never appear anywhere on the queue.
    for (let i = 0; i < 3; i++) {
      await page.reload()
      await expect(page.getByText(new RegExp(MARKER))).toHaveCount(0)
    }
  })
})
