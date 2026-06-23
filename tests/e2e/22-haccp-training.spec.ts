/**
 * tests/e2e/22-haccp-training.spec.ts
 *
 * @critical
 *
 * NET-NEW exhaustive browser-tap E2E for F-19 PR4 (Cluster C re-point).
 * Drives /haccp/training in a real Chromium browser, proving the route
 * re-pointed onto the HaccpTraining hexagon works end-to-end. Behaviour is
 * byte-identical to the prior inline supabaseService calls — these specs
 * assert the REAL on-screen strings + the persisted history row, not the
 * implementation.
 *
 * Page facts (app/haccp/training/page.tsx, mapped by line):
 *   - 3 tabs: "Butchery & Process Room" / "Warehouse Operative" /
 *     "Allergen Awareness" (lines 1524–1536).
 *   - Butchery + Warehouse: a scroll-to-bottom document reader unlocks a
 *     "Mark as read" button → an acknowledgment checklist (7 / 8 items).
 *   - Allergen: NO reader; 14 allergen checkboxes + 5 understanding items.
 *   - Staff-name input (placeholder "Full name"), supervisor preset
 *     buttons ("Hakan"/"Ege") + "Other" free-text, job-role buttons,
 *     document-version input (placeholder "V2.0"), completion + refresh
 *     date pickers (input[type=date]).
 *   - Submit "Submit training record" / "Submit allergen awareness record".
 *     Success flash: "Training record submitted".
 *   - History card shows the staff name + job role + supervisor for new rows.
 *   - Byte-identity pin (allergen): the form uses certification_date in the
 *     payload; the server returns the EXACT string 'Completion date required'
 *     when it is missing. The deviation tap posts a body without it and
 *     asserts that exact 400 string.
 *
 * Training GET is admin-only (route.ts line 22) so we log in as admin.
 * Prereqs: db:up + db:reset (local) / a healthy preview branch (Gate 4).
 * Runs under --project=chromium.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './_auth'

// Expand the document reader, scroll to the bottom, unlock + click "Mark as read".
async function readDocument(page: Page) {
  // The reader is COLLAPSED by default — click the document header (the
  // button carrying the "Must read" badge) to expand it before the scroll
  // container exists in the DOM.
  await page.getByRole('button', { name: /Must read/ }).click()
  const reader = page.locator('div.max-h-96.overflow-y-auto').first()
  await expect(reader).toBeVisible()
  // Scroll the inner container all the way down so the onScroll handler
  // fires nearBottom (scrollHeight - scrollTop - clientHeight < 80).
  await reader.evaluate((el) => { el.scrollTop = el.scrollHeight })
  const markRead = page.getByRole('button', { name: /mark as read/i })
  await expect(markRead).toBeEnabled({ timeout: 5_000 })
  await markRead.click()
}

test.describe('@critical HACCP training (F-19 PR4 re-point)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
    await page.goto('/haccp/training')
    await expect(page.getByText('Training', { exact: false }).first()).toBeVisible()
  })

  test('butchery & process room — read doc, tick all acks, submit, see history row', async ({ page }) => {
    const staff = `E2E-TRN-BUTCH-${Date.now()}`

    await page.getByRole('button', { name: 'Butchery & Process Room', exact: true }).click()

    // Scroll-to-unlock document reader → confirmation checklist appears.
    await readDocument(page)
    await expect(page.getByText(/acknowledgment checklist now unlocked/i)).toBeVisible()

    // Tick all 7 butchery acknowledgment items.
    for (const label of [
      'Read and understood this training summary',
      'Reviewed the complete MFS Global HACCP Policy Handbook (V2.0)',
      'Understand the food safety hazards in meat processing',
      'Know my critical responsibilities for temperature control and equipment cleaning',
      'Understand how to monitor Critical Control Points (CCP 3 & 4)',
      'Know what to do if problems occur',
      'Accept responsibility for food safety in my daily work',
    ]) {
      await page.getByRole('button', { name: label }).click()
    }

    // Staff name + job role + supervisor preset.
    await page.getByPlaceholder('Full name').fill(staff)
    await page.getByRole('button', { name: 'Butcher', exact: true }).click()
    await page.getByRole('button', { name: 'Hakan', exact: true }).click()

    // Doc version + dates (date pickers carry sensible defaults; set explicitly).
    await page.getByPlaceholder('V2.0').fill('V2.0')
    const dates = page.locator('input[type="date"]')
    await dates.nth(0).fill('2026-06-23')
    await dates.nth(1).fill('2027-06-23')

    await page.getByRole('button', { name: /submit training record/i }).click()
    await expect(page.getByText(/training record submitted/i)).toBeVisible({ timeout: 10_000 })

    // History reflects the new row (staff name).
    await expect(page.getByText(staff).first()).toBeVisible({ timeout: 10_000 })
  })

  test('warehouse operative — read doc, tick all 8 acks, "Other" supervisor, submit', async ({ page }) => {
    const staff = `E2E-TRN-WH-${Date.now()}`

    await page.getByRole('button', { name: 'Warehouse Operative', exact: true }).click()

    await readDocument(page)

    for (const label of [
      'Read and understood this training summary',
      'Reviewed the complete MFS Global HACCP Policy Handbook (V2.0)',
      'Understand the food safety hazards in warehouse operations',
      'Know my critical responsibilities for product receiving and temperature control',
      'Understand how to monitor Critical Control Points (CCP 1 & 2)',
      'Have the authority to reject unsuitable products',
      'Know what to do in emergency situations',
      'Accept responsibility for food safety in my daily work',
    ]) {
      await page.getByRole('button', { name: label }).click()
    }

    await page.getByPlaceholder('Full name').fill(staff)
    // Warehouse job role is read-only ("Warehouse Operative") — no button.
    // Exercise the "Other" supervisor free-text branch.
    await page.getByRole('button', { name: 'Other', exact: true }).click()
    await page.getByPlaceholder('Enter supervisor name…').fill('E2E Supervisor')

    await page.getByPlaceholder('V2.0').fill('V2.0')
    const dates = page.locator('input[type="date"]')
    await dates.nth(0).fill('2026-06-23')
    await dates.nth(1).fill('2027-06-23')

    await page.getByRole('button', { name: /submit training record/i }).click()
    await expect(page.getByText(/training record submitted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(staff).first()).toBeVisible({ timeout: 10_000 })
  })

  test('allergen awareness — tick all 14 allergens + 5 understanding items, submit', async ({ page }) => {
    const staff = `E2E-TRN-ALG-${Date.now()}`

    await page.getByRole('button', { name: 'Allergen Awareness', exact: true }).click()

    await page.getByPlaceholder('Full name').fill(staff)
    await page.getByRole('button', { name: 'Processing Worker', exact: true }).click()

    // 14 allergens. The tick is an icon-only checkbox button (no accessible
    // name) — the label sits on a SEPARATE expand button. Tick each of the 14
    // checkbox buttons by their structural class inside the allergen list.
    const allergenTicks = page.locator('button.w-5.h-5.rounded.border-2')
    await expect(allergenTicks).toHaveCount(14)
    for (let i = 0; i < 14; i++) await allergenTicks.nth(i).click()

    // 5 understanding items (single button whose accessible name IS the label).
    for (const label of [
      'I understand the risks of allergen cross-contamination in food handling',
      'I know how to store allergen-containing products separately to prevent cross-contamination',
      'I understand my responsibility to prevent allergen cross-contamination during processing and dispatch',
      'I know that allergen information must be accurate on all product labels',
      'I know to report any potential allergen contamination to my supervisor immediately',
    ]) {
      await page.getByRole('button', { name: label }).click()
    }

    await page.getByRole('button', { name: 'Ege', exact: true }).click()

    const dates = page.locator('input[type="date"]')
    await dates.nth(0).fill('2026-06-23') // certification_date
    await dates.nth(1).fill('2027-06-23') // refresh_date

    await page.getByRole('button', { name: /submit allergen awareness record/i }).click()
    await expect(page.getByText(/training record submitted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(staff).first()).toBeVisible({ timeout: 10_000 })
  })

  test('deviation — allergen POST missing certification_date returns the exact 400 string', async ({ page }) => {
    // Drive the API through the logged-in admin session (cookies attached),
    // omitting certification_date — the byte-identity pin: the server must
    // return EXACTLY 'Completion date required'. (The form gate prevents
    // this in the UI, so we tap the route directly to prove the contract.)
    const res = await page.request.post('/api/haccp/training', {
      data: {
        training_type: 'allergen_awareness',
        staff_name: 'E2E-DEV-ALG',
        job_role: 'Butcher',
        // certification_date deliberately omitted
        refresh_date: '2027-06-23',
        supervisor: 'Hakan',
        confirmation_items: { a1: true },
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Completion date required')
  })
})
