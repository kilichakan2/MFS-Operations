/**
 * tests/e2e/23-haccp-people.spec.ts
 *
 * @critical
 *
 * NET-NEW exhaustive browser-tap E2E for F-19 PR4 (Cluster C re-point).
 * Drives /haccp/people in a real Chromium browser, proving the route
 * re-pointed onto the HaccpPeople hexagon works end-to-end. Behaviour is
 * byte-identical to the prior inline supabaseService calls.
 *
 * Page facts (app/haccp/people/page.tsx, mapped by line):
 *   - 3 tabs: "Health Declaration" / "Return to Work" / "Visitor Log"
 *     (lines 697–701). Tab buttons carry a count badge once rows exist.
 *   - YNButton renders "YES"/"NO" pairs; ManagerSignOff has presets
 *     "Hakan"/"Ege" + "Other" free-text (placeholder "Enter manager name…").
 *   - Health Declaration: 4 exclusion Y/N + (if any YES) a symptom-timing
 *     pair "More than 2 days ago"/"Less than 2 days ago"; 3 secondary Y/N;
 *     staff name; start date. Submit "Submit health declaration".
 *   - Return to Work: staff name; absence dates; illness type
 *     "Gastrointestinal"/"Other illness"/"Serious / hospitalised"; an
 *     illness-specific checklist. Submit "Submit return to work certificate".
 *   - Visitor Log: name/company/reason; 9 health Y/N; (if clean) a 4-item
 *     declaration checklist; manager. Submit "Submit visitor log".
 *   - Success flash: "<label> submitted" (e.g. "Health declaration submitted").
 *   - History card shows the staff/visitor name for new rows.
 *
 * Byte-identity pin (people-visitor vs kiosk divergence): the people route
 * accepts a whitespace-only manager name (truthy check), whereas the kiosk
 * rejects it (.trim()). This spec proves the PEOPLE side accepts whitespace;
 * spec 24 proves the KIOSK side rejects it. The divergence is CORRECT —
 * asserted here, never "fixed".
 *
 * People GET allows warehouse/butcher/admin (route.ts line 27); we use admin.
 * Prereqs: db:up + db:reset (local) / healthy preview branch (Gate 4).
 * Runs under --project=chromium.
 */

import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './_auth'

test.describe('@critical HACCP people (F-19 PR4 re-point)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, process.env.E2E_USER_ADMIN!, process.env.E2E_PASSWORD_ADMIN!)
    await page.goto('/haccp/people')
    await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
  })

  test('health declaration — all-clear new starter submits and lands in history', async ({ page }) => {
    const staff = `E2E-PPL-DECL-${Date.now()}`
    // Tab buttons start with the label (+ optional count badge); the submit
    // button is "Submit health declaration" — anchor to start to avoid it.
    await page.getByRole('button', { name: /^Health Declaration/ }).click()

    await page.getByPlaceholder('Full name').fill(staff)
    await page.locator('input[type="date"]').first().fill('2026-06-23')

    // 4 exclusion questions — all NO (no exclusion, no symptom-timing panel).
    // Each question row has its own YES/NO pair; click the NO of each row.
    const noButtons = page.getByRole('button', { name: 'NO', exact: true })
    // Exclusion (4) + secondary (3) = 7 NO buttons total once both blocks render.
    // Click the first 4 (exclusion) — secondary block is always present.
    for (let i = 0; i < 4; i++) await noButtons.nth(i).click()
    // 3 secondary questions — answer NO too (any answer is valid).
    for (let i = 4; i < 7; i++) await noButtons.nth(i).click()

    await page.getByRole('button', { name: 'Hakan', exact: true }).click()

    await page.getByRole('button', { name: /submit health declaration/i }).click()
    await expect(page.getByText(/health declaration submitted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(staff).first()).toBeVisible({ timeout: 10_000 })
  })

  test('health declaration — exclusion YES surfaces symptom-timing; "more than 2 days" allows submit', async ({ page }) => {
    const staff = `E2E-PPL-DECL-EXC-${Date.now()}`
    await page.getByRole('button', { name: /^Health Declaration/ }).click()

    await page.getByPlaceholder('Full name').fill(staff)
    await page.locator('input[type="date"]').first().fill('2026-06-23')

    // First exclusion question = YES → triggers the symptom-timing panel.
    await page.getByRole('button', { name: 'YES', exact: true }).first().click()
    await expect(page.getByText(/symptom timing/i)).toBeVisible()
    // "More than 2 days ago" → fit for work, submit allowed.
    await page.getByRole('button', { name: /more than 2 days ago/i }).click()
    await expect(page.getByText(/symptoms resolved — may proceed/i)).toBeVisible()

    // 7 question rows (4 exclusion + 3 secondary), each its own YES/NO pair.
    // q1 is already YES — click NO on rows 1..6 (the remaining 3 exclusion +
    // 3 secondary). Clicking NO on index 0 would OVERRIDE q1's YES and clear
    // the exclusion, so START at index 1.
    const noButtons = page.getByRole('button', { name: 'NO', exact: true })
    for (let i = 1; i < 7; i++) await noButtons.nth(i).click()

    await page.getByRole('button', { name: 'Ege', exact: true }).click()
    await page.getByRole('button', { name: /submit health declaration/i }).click()
    await expect(page.getByText(/health declaration submitted/i)).toBeVisible({ timeout: 10_000 })
  })

  test('return to work — GI illness, 48h checklist, submit', async ({ page }) => {
    const staff = `E2E-PPL-RTW-${Date.now()}`
    await page.getByRole('button', { name: /^Return to Work/ }).click()

    await page.getByPlaceholder('Full name').fill(staff)
    await page.getByRole('button', { name: /gastrointestinal/i }).click()

    // GI checklist: 2 items, both must be confirmed.
    await page.getByRole('button', { name: /no symptoms for a full 48 hours/i }).click()
    await page.getByRole('button', { name: /medical certificate provided/i }).click()

    await page.getByRole('button', { name: 'Hakan', exact: true }).click()
    await page.getByRole('button', { name: /submit return to work certificate/i }).click()
    await expect(page.getByText(/return to work certificate submitted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(staff).first()).toBeVisible({ timeout: 10_000 })
  })

  test('visitor log — clean visitor, all declarations, submit', async ({ page }) => {
    const visitor = `E2E-PPL-VIS-${Date.now()}`
    await page.getByRole('button', { name: /^Visitor Log/ }).click()

    await page.getByPlaceholder('Full name').fill(visitor)
    await page.getByPlaceholder('Company or organisation').fill('E2E Contractors Ltd')
    await page.getByPlaceholder('Purpose of visit').fill('Maintenance')

    // 9 health questions, each its own YES/NO pair (in DOM order). vq1–vq8 = NO
    // (no exclusion); vq9 = YES (understands). Answered buttons stay in the DOM,
    // so address each question's button by its row index (not nth(0) repeatedly).
    const noButtons = page.getByRole('button', { name: 'NO', exact: true })
    const yesButtons = page.getByRole('button', { name: 'YES', exact: true })
    for (let i = 0; i < 8; i++) await noButtons.nth(i).click()
    await yesButtons.nth(8).click() // vq9 = YES

    // Declaration checklist appears once all answered + no exclusion.
    for (const label of [
      'I am not suffering from any infection and know of no reason why I should not enter the facility',
      'I have removed all jewellery and watches',
      'My tools and equipment are clean and free from contamination',
      'My oils, greases and lubricants are food grade and allergen free',
    ]) {
      await page.getByRole('button', { name: label }).click()
    }

    await page.getByRole('button', { name: 'Ege', exact: true }).click()
    await page.getByRole('button', { name: /submit visitor log/i }).click()
    await expect(page.getByText(/visitor log submitted/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(visitor).first()).toBeVisible({ timeout: 10_000 })
  })

  test('deviation — POST without record_type returns the exact 400 string', async ({ page }) => {
    const res = await page.request.post('/api/haccp/people', {
      data: { staff_name: 'E2E-DEV' }, // no record_type
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('record_type required')
  })

  test('byte-identity pin — people-visitor ACCEPTS a whitespace-only manager name (truthy check)', async ({ page }) => {
    // The people route uses `if (!body.manager_signed_by)` (truthy) — a
    // whitespace-only string is truthy, so it PASSES (200). The kiosk route
    // uses `.trim()` and REJECTS the same input (spec 24). This divergence is
    // CORRECT-by-design — assert it holds, never "fix" it.
    const res = await page.request.post('/api/haccp/people', {
      data: {
        record_type: 'visitor',
        visitor_name: 'E2E-WS-Visitor',
        visitor_company: 'WS Co',
        visitor_reason: 'pin test',
        health_questions: { vq1: false, vq9: true },
        visitor_declaration_confirmed: true,
        manager_signed_by: '   ', // whitespace only
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
