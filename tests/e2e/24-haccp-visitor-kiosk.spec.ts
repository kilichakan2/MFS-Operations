/**
 * tests/e2e/24-haccp-visitor-kiosk.spec.ts
 *
 * @critical
 *
 * NET-NEW exhaustive browser-tap E2E for F-19 PR4 (Cluster C re-point).
 * Drives /haccp/visitor — the PUBLIC kiosk (no login) — in a real Chromium
 * browser, proving the route re-pointed onto the HaccpPeople hexagon (the
 * SHARED buildVisitorHealthRecord) works end-to-end. Behaviour is
 * byte-identical to the prior inline supabaseService call.
 *
 * Page facts (app/haccp/visitor/page.tsx, mapped by line):
 *   - PUBLIC: no auth (route.ts has no role gate).
 *   - 1: name/company/reason inputs (placeholders "e.g. John Smith",
 *     "e.g. ABC Supplies Ltd", "e.g. Equipment maintenance").
 *   - 2: 9 health Y/N pairs (vq1–vq9). Buttons read "Yes"/"No".
 *     Exclusion = any vq1–vq8 YES OR vq9 NO.
 *   - 3: 4 declaration checkbox buttons.
 *   - 4: "Staff member name" input (placeholder "Name of staff member").
 *   - Submit "Submit sign-in". On exclusion, a "Confirm & record" panel.
 *   - Clean outcome → "Welcome, {name}" + a 10s auto-reset countdown.
 *   - Excluded outcome → "Entry not permitted" + auto-reset.
 *   - BOTH outcomes write a haccp_health_records row (audit trail) — the
 *     kiosk saves excluded visitors with fit_for_work=false.
 *
 * Byte-identity pin (kiosk vs people divergence): the kiosk uses
 * `.trim()` on manager_signed_by and REJECTS a whitespace-only name (400).
 * The people route accepts it (spec 23). Asserted here via the API.
 *
 * Note: the on-screen success/exclusion strings are the REAL page strings
 * ("Welcome, {name}" / "Entry not permitted"), NOT the paraphrase in the
 * matrix brief — assert what the page actually renders.
 *
 * Prereqs: db:up + db:reset (local) / healthy preview branch (Gate 4).
 * Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'

const VQ_LABELS = [
  'In the past 24 hours, have you suffered from sickness, vomiting or diarrhoea?',
  'Do you have any conditions of the skin, hands, arms or face?',
  'Are you suffering from boils, sties or a septic finger?',
  'Do you suffer from discharge from eyes, ears, gums or throat?',
  'Are you suffering from a heavy cold or flu?',
  'Have you been in contact with anyone suffering from enteric fever (e.g. Typhoid, Paratyphoid or Hepatitis)?',
  'Do you have any allergies?',
  'Are you required to carry medicines we should be aware of?',
  'Do you understand all of the above?',
]

// Answer each kiosk question Yes/No by SCOPING the click to that question's
// own card (located via its label text). Asserts the selection registered
// (the chosen button picks up a green/red background) before moving on —
// avoids the nth-index/React-state race that a flat global button list hits.
async function answerKioskQuestions(page: Page, answers: ('Yes' | 'No')[]) {
  for (let i = 0; i < answers.length; i++) {
    // The card is the div that contains both the label <p> and the Yes/No pair.
    const card = page.locator('div', { has: page.getByText(VQ_LABELS[i], { exact: true }) }).last()
    const btn = card.getByRole('button', { name: answers[i], exact: true })
    await btn.click()
    // Confirm it took: the selected button gets bg-green-500 or bg-red-500.
    await expect(btn).toHaveClass(/bg-(green|red)-500/)
  }
}

test.describe('@critical HACCP visitor kiosk (F-19 PR4 re-point)', () => {
  test('clean visitor — welcome screen + a row is written', async ({ page }) => {
    const visitor = `E2E-KIOSK-OK-${Date.now()}`
    await page.goto('/haccp/visitor')
    await expect(page.getByRole('heading', { name: /visitor sign-in/i })).toBeVisible()

    await page.getByPlaceholder('e.g. John Smith').fill(visitor)
    await page.getByPlaceholder('e.g. ABC Supplies Ltd').fill('E2E Kiosk Co')
    await page.getByPlaceholder('e.g. Equipment maintenance').fill('Delivery')

    // vq1–vq8 = No (no exclusion), vq9 = Yes (understands) → clean.
    await answerKioskQuestions(page, ['No', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'Yes'])

    // 4 declaration checkboxes.
    for (const label of [
      'I am not suffering from any infection and know of no reason why I should not enter the facility',
      'I have removed all jewellery and watches',
      'My tools and equipment are clean and free from contamination',
      'My oils, greases and lubricants are food grade and allergen free',
    ]) {
      await page.getByRole('button', { name: label }).click()
    }

    await page.getByPlaceholder('Name of staff member').fill('E2E Host')

    await page.getByRole('button', { name: /submit sign-in/i }).click()
    // Clean outcome → "Welcome, {name}" + countdown reset. The success screen
    // ONLY renders after res.ok from the insert (page.tsx line 101–102), so
    // its appearance is the audit-trail proof: a haccp_health_records row was
    // written with fit_for_work=true. DB-shape is pinned in the integration
    // suite (haccpPeopleTraining.test.ts).
    await expect(page.getByText(`Welcome, ${visitor}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/this page will reset in/i)).toBeVisible()
  })

  test('excluded visitor — entry-not-permitted screen via Confirm & record; a row is still written', async ({ page }) => {
    const visitor = `E2E-KIOSK-EXC-${Date.now()}`
    await page.goto('/haccp/visitor')
    await expect(page.getByRole('heading', { name: /visitor sign-in/i })).toBeVisible()

    await page.getByPlaceholder('e.g. John Smith').fill(visitor)
    await page.getByPlaceholder('e.g. ABC Supplies Ltd').fill('E2E Kiosk Co')
    await page.getByPlaceholder('e.g. Equipment maintenance').fill('Delivery')

    // vq1 = Yes (sickness in last 24h) → exclusion. vq2–vq8 = No, vq9 = Yes.
    await answerKioskQuestions(page, ['Yes', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'Yes'])
    // Exclusion warning appears inline.
    await expect(page.getByText(/you may not be able to enter the production area/i)).toBeVisible()

    // Declarations + manager still required for a valid submit.
    for (const label of [
      'I am not suffering from any infection and know of no reason why I should not enter the facility',
      'I have removed all jewellery and watches',
      'My tools and equipment are clean and free from contamination',
      'My oils, greases and lubricants are food grade and allergen free',
    ]) {
      await page.getByRole('button', { name: label }).click()
    }
    await page.getByPlaceholder('Name of staff member').fill('E2E Host')

    // Submit routes through the exclusion-confirmation panel, not a direct send.
    await page.getByRole('button', { name: /submit sign-in/i }).click()
    await expect(page.getByText(/your visit will be recorded as excluded/i)).toBeVisible()
    await page.getByRole('button', { name: /confirm & record/i }).click()

    // Excluded outcome → "Entry not permitted" screen + countdown.
    await expect(page.getByText(/entry not permitted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/this page will reset in/i)).toBeVisible()
    // The success-screen render only happens after res.ok — so a row (with
    // fit_for_work=false) was written. DB-shape is pinned in the integration
    // suite; here we prove the excluded audit path completes.
  })

  test('byte-identity pin — kiosk REJECTS a whitespace-only manager name (.trim, 400)', async ({ page }) => {
    // The kiosk route uses `if (!body.manager_signed_by?.trim())` → a
    // whitespace-only name is rejected with the exact 400 string. The people
    // route accepts the same input (spec 23). This divergence is CORRECT —
    // assert it holds, never "fix" it.
    await page.goto('/haccp/visitor')
    const res = await page.request.post('/api/haccp/visitor', {
      data: {
        visitor_name: 'E2E-WS-Kiosk',
        visitor_company: 'WS Co',
        visitor_reason: 'pin test',
        health_questions: { vq1: false, vq9: true },
        visitor_declaration_confirmed: true,
        manager_signed_by: '   ', // whitespace only
        fit_for_work: true,
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Manager sign-off required')
  })
})
